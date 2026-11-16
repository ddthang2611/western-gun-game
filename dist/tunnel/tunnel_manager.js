"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TunnelManager = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const https_1 = __importDefault(require("https"));
const config_1 = require("../config");
class TunnelManager {
    static instance;
    tunnelProcess = null;
    activeUrl = null;
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
    downloadFile(url, dest) {
        return new Promise((resolve, reject) => {
            https_1.default
                .get(url, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return this.downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                }
                if (res.statusCode !== 200) {
                    return reject(new Error(`Failed to download binary: HTTP ${res.statusCode}`));
                }
                const fileStream = fs_1.default.createWriteStream(dest);
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
            const timeout = setTimeout(() => {
                if (!resolved) {
                    this.stopTunnel();
                    reject(new Error("Timeout (25s) waiting for Cloudflare Tunnel public URL."));
                }
            }, 25000);
            const handleOutput = (data) => {
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
    stopTunnel() {
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
        if (!originHeader)
            return true; // Accept same-origin or native client without Origin header
        try {
            const url = new URL(originHeader);
            const host = url.hostname;
            // 1. Localhost and Loopback
            if (host === "localhost" || host === "127.0.0.1" || host === "::1")
                return true;
            // 2. Private LAN networks (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            if (host.startsWith("192.168.") || host.startsWith("10."))
                return true;
            if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host))
                return true;
            // 3. Active Cloudflare Tunnel domain
            if (this.activeUrl) {
                const tunnelHost = new URL(this.activeUrl).hostname;
                if (host === tunnelHost)
                    return true;
            }
            if (host.endsWith(".trycloudflare.com"))
                return true;
            // 4. Configured custom domain
            if (config_1.CONFIG.TUNNEL_DOMAIN && host === config_1.CONFIG.TUNNEL_DOMAIN)
                return true;
            return false;
        }
        catch {
            return false;
        }
    }
}
exports.TunnelManager = TunnelManager;
