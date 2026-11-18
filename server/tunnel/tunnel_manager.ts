import { spawn, ChildProcess, execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import https from "https";
import { CONFIG } from "../config";

const MAX_DOWNLOAD_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30000;

function isPrivateLanIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  if (octets.some((n) => n < 0 || n > 255)) return false;

  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export class TunnelManager {
  private static instance: TunnelManager;
  private tunnelProcess: ChildProcess | null = null;
  private activeUrl: string | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;

  public static getInstance(): TunnelManager {
    if (!TunnelManager.instance) {
      TunnelManager.instance = new TunnelManager();
    }
    return TunnelManager.instance;
  }

  public getActiveUrl(): string | null {
    return this.activeUrl;
  }

  // Locate cloudflared binary or download to bin/
  private async ensureBinary(): Promise<string> {
    const isWindows = process.platform === "win32";
    const binName = isWindows ? "cloudflared.exe" : "cloudflared";
    const localBinPath = path.join(CONFIG.BIN_DIR, binName);

    // 1. Check system PATH
    try {
      const checkCmd = isWindows ? `where ${binName}` : `which ${binName}`;
      const pathResult = execSync(checkCmd, { stdio: "pipe" }).toString().trim().split("\n")[0];
      if (pathResult && fs.existsSync(pathResult)) {
        return pathResult;
      }
    } catch {}

    // 2. Check local binary in western-gun-game/bin/
    if (fs.existsSync(localBinPath)) {
      return localBinPath;
    }

    // 3. Download standalone binary from Cloudflare GitHub Release
    fs.mkdirSync(CONFIG.BIN_DIR, { recursive: true });
    console.log(`[Tunnel] Binary 'cloudflared' not found. Downloading for platform ${process.platform}...`);

    let downloadUrl = "";
    if (isWindows) {
      downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
    } else if (process.platform === "darwin") {
      downloadUrl =
        process.arch === "arm64"
          ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64"
          : "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64";
    } else {
      downloadUrl =
        process.arch === "arm64"
          ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
          : "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
    }

    await this.downloadFile(downloadUrl, localBinPath);
    if (!isWindows) {
      fs.chmodSync(localBinPath, 0o755);
    }
    console.log(`[Tunnel] Successfully downloaded cloudflared to ${localBinPath}`);
    return localBinPath;
  }

  private downloadFile(url: string, dest: string, redirectDepth = 0): Promise<void> {
    if (redirectDepth > MAX_DOWNLOAD_REDIRECTS) {
      return Promise.reject(new Error("Too many redirects while downloading cloudflared."));
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return Promise.reject(new Error("Invalid download URL."));
    }
    if (parsedUrl.protocol !== "https:") {
      return Promise.reject(new Error("Refusing non-HTTPS download URL for cloudflared."));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const tempDest = `${dest}.tmp-${process.pid}-${Date.now()}`;

      const cleanupTemp = () => {
        try {
          if (fs.existsSync(tempDest)) {
            fs.unlinkSync(tempDest);
          }
        } catch {}
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanupTemp();
        reject(err);
      };

      const req = https.get(parsedUrl, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          try {
            const nextUrl = new URL(res.headers.location, parsedUrl).toString();
            this.downloadFile(nextUrl, dest, redirectDepth + 1).then(resolve, reject);
          } catch (err: any) {
            fail(err instanceof Error ? err : new Error("Invalid redirect location."));
          }
          return;
        }

        if (status !== 200) {
          res.resume();
          fail(new Error(`Failed to download binary: HTTP ${status}`));
          return;
        }

        const hash = crypto.createHash("sha256");
        const fileStream = fs.createWriteStream(tempDest);

        res.on("data", (chunk: Buffer) => {
          hash.update(chunk);
        });
        res.on("error", (err) => {
          fileStream.destroy();
          fail(err instanceof Error ? err : new Error("Download response stream failed."));
        });
        fileStream.on("error", (err) => {
          res.destroy();
          fail(err instanceof Error ? err : new Error("Failed writing binary to disk."));
        });

        res.pipe(fileStream);

        fileStream.on("finish", () => {
          fileStream.close((closeErr) => {
            if (closeErr) {
              fail(closeErr);
              return;
            }
            if (settled) return;

            const expectedSha = (CONFIG.CLOUDFLARED_SHA256 || "").trim().toLowerCase();
            if (expectedSha) {
              const actualSha = hash.digest("hex").toLowerCase();
              const actualBuf = Buffer.from(actualSha, "utf8");
              const expectedBuf = Buffer.from(expectedSha, "utf8");
              const matches =
                actualBuf.length === expectedBuf.length &&
                crypto.timingSafeEqual(actualBuf, expectedBuf);
              if (!matches) {
                fail(new Error("cloudflared SHA256 checksum verification failed."));
                return;
              }
            }

            try {
              fs.renameSync(tempDest, dest);
              settled = true;
              resolve();
            } catch (renameErr: any) {
              fail(renameErr instanceof Error ? renameErr : new Error("Failed finalizing downloaded binary."));
            }
          });
        });
      });

      req.on("timeout", () => {
        req.destroy(new Error("Timed out downloading cloudflared binary."));
      });
      req.on("error", (err) => {
        fail(err instanceof Error ? err : new Error("Download request failed."));
      });
    });
  }

  // Launches Quick Tunnel proxying to local server port
  public async startTunnel(port: number): Promise<string> {
    if (this.activeUrl) return this.activeUrl;

    const binPath = await this.ensureBinary();

    return new Promise((resolve, reject) => {
      const child = spawn(binPath, ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.tunnelProcess = child;
      let resolved = false;

      this.startupTimeout = setTimeout(() => {
        if (!resolved) {
          this.stopTunnel();
          reject(new Error("Timeout (25s) waiting for Cloudflare Tunnel public URL."));
        }
      }, 25000);

      const clearStartupTimer = () => {
        if (this.startupTimeout) {
          clearTimeout(this.startupTimeout);
          this.startupTimeout = null;
        }
      };

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          clearStartupTimer();
          this.activeUrl = match[0];
          resolve(this.activeUrl);
        }
      };

      child.stderr.on("data", handleOutput);
      child.stdout.on("data", handleOutput);

      child.on("error", (err) => {
        clearStartupTimer();
        this.tunnelProcess = null;
        this.activeUrl = null;
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      child.on("close", (code) => {
        clearStartupTimer();
        this.tunnelProcess = null;
        this.activeUrl = null;
        if (!resolved) {
          resolved = true;
          reject(new Error(`Cloudflared exited prematurely with code: ${code}`));
        }
      });
    });
  }

  public stopTunnel(): void {
    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }
    if (this.tunnelProcess) {
      try {
        this.tunnelProcess.kill("SIGTERM");
      } catch {}
      this.tunnelProcess = null;
    }
    this.activeUrl = null;
  }

  // Validates Origin header for incoming WebSocket connections (SEC-02)
  public isOriginAllowed(originHeader?: string): boolean {
    if (!originHeader || typeof originHeader !== "string") return false;

    try {
      const url = new URL(originHeader);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return false;
      }

      if (this.activeUrl) {
        const activeOrigin = new URL(this.activeUrl).origin;
        if (url.origin === activeOrigin) return true;
      }

      const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

      if (CONFIG.TUNNEL_DOMAIN) {
        const rawDomain = String(CONFIG.TUNNEL_DOMAIN).trim();
        const expectedHost = rawDomain.includes("://")
          ? new URL(rawDomain).hostname.toLowerCase()
          : rawDomain.toLowerCase().replace(/:\d+$/, "");
        if (
          url.protocol === "https:" &&
          host === expectedHost &&
          (url.port === "" || url.port === "443")
        ) {
          return true;
        }
      }

      const isLocalOrLan =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        isPrivateLanIpv4(host);

      if (isLocalOrLan) {
        const allowedPorts = new Set<string>([String(CONFIG.PORT), ""]);
        if (process.env.NODE_ENV !== "production") {
          allowedPorts.add("5173");
          allowedPorts.add("4173");
        }
        if (allowedPorts.has(url.port)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }
}
