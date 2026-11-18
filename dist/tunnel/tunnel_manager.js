"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TunnelManager = void 0;
const child_process_1 = require("child_process");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const config_1 = require("../config");
const MAX_DOWNLOAD_REDIRECTS = 5;
const DOWNLOAD_TIMEOUT_MS = 30000;
function isPrivateLanIpv4(host) {
    const parts = host.split(".");
    if (parts.length !== 4)
        return false;
    const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
    if (octets.some((n) => n < 0 || n > 255))
        return false;
    const [a, b] = octets;
    if (a === 10)
        return true;
    if (a === 192 && b === 168)
        return true;
    if (a === 172 && b >= 16 && b <= 31)
        return true;
    return false;
}
class TunnelManager {
    static instance;
    tunnelProcess = null;
    activeUrl = null;
    startupTimeout = null;
    static getInstance() {
        if (!TunnelManager.instance) {
            TunnelManager.instance = new TunnelManager();
        }
        return TunnelManager.instance;
    }
    getActiveUrl() {
        return this.activeUrl;
    }
    // Locate cloudflared binary or download to bin/
    async ensureBinary() {
        const isWindows = process.platform === "win32";
        const binName = isWindows ? "cloudflared.exe" : "cloudflared";
        const localBinPath = path_1.default.join(config_1.CONFIG.BIN_DIR, binName);
        // 1. Check system PATH
        try {
            const checkCmd = isWindows ? `where ${binName}` : `which ${binName}`;
            const pathResult = (0, child_process_1.execSync)(checkCmd, { stdio: "pipe" }).toString().trim().split("\n")[0];
            if (pathResult && fs_1.default.existsSync(pathResult)) {
                return pathResult;
            }
        }
        catch { }
        // 2. Check local binary in western-gun-game/bin/
        if (fs_1.default.existsSync(localBinPath)) {
            return localBinPath;
        }
        // 3. Download standalone binary from Cloudflare GitHub Release
        fs_1.default.mkdirSync(config_1.CONFIG.BIN_DIR, { recursive: true });
        console.log(`[Tunnel] Binary 'cloudflared' not found. Downloading for platform ${process.platform}...`);
        let downloadUrl = "";
        if (isWindows) {
            downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
        }
        else if (process.platform === "darwin") {
            downloadUrl =
                process.arch === "arm64"
                    ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64"
                    : "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64";
        }
        else {
            downloadUrl =
                process.arch === "arm64"
                    ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
                    : "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
        }
        await this.downloadFile(downloadUrl, localBinPath);
        if (!isWindows) {
            fs_1.default.chmodSync(localBinPath, 0o755);
        }
        console.log(`[Tunnel] Successfully downloaded cloudflared to ${localBinPath}`);
        return localBinPath;
    }
    downloadFile(url, dest, redirectDepth = 0) {
        if (redirectDepth > MAX_DOWNLOAD_REDIRECTS) {
            return Promise.reject(new Error("Too many redirects while downloading cloudflared."));
        }
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        }
        catch {
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
                    if (fs_1.default.existsSync(tempDest)) {
                        fs_1.default.unlinkSync(tempDest);
                    }
                }
                catch { }
            };
            const fail = (err) => {
                if (settled)
                    return;
                settled = true;
                cleanupTemp();
                reject(err);
            };
            const req = https_1.default.get(parsedUrl, { timeout: DOWNLOAD_TIMEOUT_MS }, (res) => {
                const status = res.statusCode || 0;
                if (status >= 300 && status < 400 && res.headers.location) {
                    res.resume();
                    try {
                        const nextUrl = new URL(res.headers.location, parsedUrl).toString();
                        this.downloadFile(nextUrl, dest, redirectDepth + 1).then(resolve, reject);
                    }
                    catch (err) {
                        fail(err instanceof Error ? err : new Error("Invalid redirect location."));
                    }
                    return;
                }
                if (status !== 200) {
                    res.resume();
                    fail(new Error(`Failed to download binary: HTTP ${status}`));
                    return;
                }
                const hash = crypto_1.default.createHash("sha256");
                const fileStream = fs_1.default.createWriteStream(tempDest);
                res.on("data", (chunk) => {
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
                        if (settled)
                            return;
                        const expectedSha = (config_1.CONFIG.CLOUDFLARED_SHA256 || "").trim().toLowerCase();
                        if (expectedSha) {
                            const actualSha = hash.digest("hex").toLowerCase();
                            const actualBuf = Buffer.from(actualSha, "utf8");
                            const expectedBuf = Buffer.from(expectedSha, "utf8");
                            const matches = actualBuf.length === expectedBuf.length &&
                                crypto_1.default.timingSafeEqual(actualBuf, expectedBuf);
                            if (!matches) {
                                fail(new Error("cloudflared SHA256 checksum verification failed."));
                                return;
                            }
                        }
                        try {
                            fs_1.default.renameSync(tempDest, dest);
                            settled = true;
                            resolve();
                        }
                        catch (renameErr) {
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
    async startTunnel(port) {
        if (this.activeUrl)
            return this.activeUrl;
        const binPath = await this.ensureBinary();
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(binPath, ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"], {
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
            const handleOutput = (data) => {
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
    stopTunnel() {
        if (this.startupTimeout) {
            clearTimeout(this.startupTimeout);
            this.startupTimeout = null;
        }
        if (this.tunnelProcess) {
            try {
                this.tunnelProcess.kill("SIGTERM");
            }
            catch { }
            this.tunnelProcess = null;
        }
        this.activeUrl = null;
    }
    // Validates Origin header for incoming WebSocket connections (SEC-02)
    isOriginAllowed(originHeader) {
        if (!originHeader || typeof originHeader !== "string")
            return false;
        try {
            const url = new URL(originHeader);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                return false;
            }
            if (this.activeUrl) {
                const activeOrigin = new URL(this.activeUrl).origin;
                if (url.origin === activeOrigin)
                    return true;
            }
            const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
            if (config_1.CONFIG.TUNNEL_DOMAIN) {
                const rawDomain = String(config_1.CONFIG.TUNNEL_DOMAIN).trim();
                const expectedHost = rawDomain.includes("://")
                    ? new URL(rawDomain).hostname.toLowerCase()
                    : rawDomain.toLowerCase().replace(/:\d+$/, "");
                if (url.protocol === "https:" &&
                    host === expectedHost &&
                    (url.port === "" || url.port === "443")) {
                    return true;
                }
            }
            const isLocalOrLan = host === "localhost" ||
                host === "127.0.0.1" ||
                host === "::1" ||
                isPrivateLanIpv4(host);
            if (isLocalOrLan) {
                const allowedPorts = new Set([String(config_1.CONFIG.PORT), ""]);
                if (process.env.NODE_ENV !== "production") {
                    allowedPorts.add("5173");
                    allowedPorts.add("4173");
                }
                if (allowedPorts.has(url.port)) {
                    return true;
                }
            }
            return false;
        }
        catch {
            return false;
        }
    }
}
exports.TunnelManager = TunnelManager;
