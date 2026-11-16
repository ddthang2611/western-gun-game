import { spawn, ChildProcess, execSync } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import { CONFIG } from "../config";

export class TunnelManager {
  private static instance: TunnelManager;
  private tunnelProcess: ChildProcess | null = null;
  private activeUrl: string | null = null;

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

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return this.downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Failed to download binary: HTTP ${res.statusCode}`));
          }
          const fileStream = fs.createWriteStream(dest);
          res.pipe(fileStream);
          fileStream.on("finish", () => {
            fileStream.close();
            resolve();
          });
        })
        .on("error", reject);
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

      const timeout = setTimeout(() => {
        if (!resolved) {
          this.stopTunnel();
          reject(new Error("Timeout (25s) waiting for Cloudflare Tunnel public URL."));
        }
      }, 25000);

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.activeUrl = match[0];
          resolve(this.activeUrl);
        }
      };

      child.stderr.on("data", handleOutput);
      child.stdout.on("data", handleOutput);

      child.on("close", (code) => {
        this.tunnelProcess = null;
        this.activeUrl = null;
        if (!resolved) {
          clearTimeout(timeout);
          reject(new Error(`Cloudflared exited prematurely with code: ${code}`));
        }
      });

      // Register process reclamation hook on server shutdown
      const cleanup = () => this.stopTunnel();
      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
      process.once("exit", cleanup);
    });
  }

  public stopTunnel(): void {
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
    if (!originHeader) return true; // Accept same-origin or native client without Origin header

    try {
      const url = new URL(originHeader);
      const host = url.hostname;

      // 1. Localhost and Loopback
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;

      // 2. Private LAN networks (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
      if (host.startsWith("192.168.") || host.startsWith("10.")) return true;
      if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;

      // 3. Active Cloudflare Tunnel domain
      if (this.activeUrl) {
        const tunnelHost = new URL(this.activeUrl).hostname;
        if (host === tunnelHost) return true;
      }
      if (host.endsWith(".trycloudflare.com")) return true;

      // 4. Configured custom domain
      if (CONFIG.TUNNEL_DOMAIN && host === CONFIG.TUNNEL_DOMAIN) return true;

      return false;
    } catch {
      return false;
    }
  }
}
