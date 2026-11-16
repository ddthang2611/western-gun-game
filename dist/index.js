"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCookies = void 0;
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const config_1 = require("./config");
const database_1 = require("./db/database");
const catalog_repository_1 = require("./db/catalog_repository");
const lobby_handler_1 = require("./ws/lobby_handler");
const tunnel_manager_1 = require("./tunnel/tunnel_manager");
const auth_routes_1 = require("./api/auth_routes");
const catalog_routes_1 = require("./api/catalog_routes");
const cookie_utils_1 = require("./api/cookie_utils");
Object.defineProperty(exports, "parseCookies", { enumerable: true, get: function () { return cookie_utils_1.parseCookies; } });
function getLocalLanIps() {
    const interfaces = os_1.default.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
            if (net.family === "IPv4" && !net.internal) {
                ips.push(net.address);
            }
        }
    }
    return ips;
}
async function startServer() {
    // Initialize Runtime Database
    try {
        (0, database_1.getRuntimeDatabase)();
    }
    catch (err) {
        console.error("Runtime database initialization failure:", err.message);
    }
    // Attempt auto-unlock using DB_SECRET_KEY in environment
    const autoUnlockResult = (0, database_1.unlockCatalogDatabase)(config_1.CONFIG.DB_SECRET_KEY || "");
    if (autoUnlockResult.success) {
        const summary = catalog_repository_1.CatalogRepository.getInstance().getSummary();
        console.log(`Database auto-unlocked successfully: ${summary.cardsCount} cards, ${summary.charactersCount} characters, ${summary.rolesCount} roles (Schema v${summary.schemaVersion})`);
        lobby_handler_1.LobbyManager.getInstance().restoreFromPersistence();
    }
    else {
        console.log("=======================================================");
        console.log("[Western Gun] Catalog database is currently LOCKED.");
        console.log("[Western Gun] Reason: " + autoUnlockResult.message);
        console.log("[Western Gun] Enter DB Secret Key in terminal or open Web UI to unlock.");
        console.log("=======================================================");
        // Initialize terminal readline prompt for direct console unlocking
        if (process.stdin.isTTY) {
            const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
            rl.question("Enter DB Secret Key: ", (answer) => {
                const manualResult = (0, database_1.unlockCatalogDatabase)(answer.trim());
                if (manualResult.success) {
                    const summary = catalog_repository_1.CatalogRepository.getInstance().getSummary();
                    console.log(`Database unlocked from terminal: ${summary.cardsCount} cards loaded.`);
                    lobby_handler_1.LobbyManager.getInstance().restoreFromPersistence();
                    lobby_handler_1.LobbyManager.getInstance().broadcastMessage("DATABASE_UNLOCKED", summary);
                    rl.close();
                }
                else {
                    console.error("Incorrect DB Secret Key: " + manualResult.message);
                    rl.close();
                }
            });
        }
    }
    const app = (0, express_1.default)();
    app.disable("x-powered-by");
    // Security Headers (SEC-02 & OWASP Top 10)
    app.use((_req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none';");
        next();
    });
    // Dynamic origin validation preventing credential theft via reflected CORS (VULN-02)
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            if (!origin || tunnel_manager_1.TunnelManager.getInstance().isOriginAllowed(origin)) {
                callback(null, true);
            }
            else {
                callback(new Error("CORS policy violation: Untrusted origin blocked"));
            }
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: "16kb" }));
    // Static assets & Client build
    app.use("/assets", express_1.default.static(config_1.CONFIG.ASSETS_DIR));
    app.use(express_1.default.static(config_1.CONFIG.CLIENT_DIST));
    // Health check & Server Status
    app.get("/api/status", (_req, res) => {
        const unlocked = (0, database_1.isDatabaseUnlocked)();
        res.json({
            status: unlocked ? "ready" : "locked",
            requiresUnlock: !unlocked,
            port: config_1.CONFIG.PORT,
            timestamp: Date.now(),
            lanIps: getLocalLanIps(),
            tunnelUrl: tunnel_manager_1.TunnelManager.getInstance().getActiveUrl(),
        });
    });
    app.get("/api/health", (_req, res) => {
        const unlocked = (0, database_1.isDatabaseUnlocked)();
        res.json({
            status: unlocked ? "ok" : "locked",
            port: config_1.CONFIG.PORT,
            timestamp: Date.now(),
            lanIps: getLocalLanIps(),
            tunnelUrl: tunnel_manager_1.TunnelManager.getInstance().getActiveUrl(),
        });
    });
    // Modular API routes
    app.use("/api/auth", auth_routes_1.authRouter);
    app.use("/api", catalog_routes_1.catalogRouter);
    // SPA fallback for /dev-test UI sandbox route
    app.get("/dev-test", (_req, res) => {
        const indexHtml = path_1.default.join(config_1.CONFIG.CLIENT_DIST, "index.html");
        if (fs_1.default.existsSync(indexHtml)) {
            res.sendFile(indexHtml);
            return;
        }
        res.status(404).send("Client build not found. Run npm --prefix client run build or open Vite dev server at /dev-test.");
    });
    const server = http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    const lobbyManager = lobby_handler_1.LobbyManager.getInstance();
    const tunnelManager = tunnel_manager_1.TunnelManager.getInstance();
    // Validate Origin and authenticate WebSocket upgrade (SEC-02)
    server.on("upgrade", (req, socket, head) => {
        const origin = req.headers.origin;
        if (!tunnelManager.isOriginAllowed(origin)) {
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    });
    const aliveSockets = new WeakMap();
    wss.on("connection", (ws, req) => {
        aliveSockets.set(ws, true);
        ws.on("pong", () => {
            aliveSockets.set(ws, true);
        });
        const cfIp = req.headers["cf-connecting-ip"];
        const xff = req.headers["x-forwarded-for"];
        const ip = (typeof cfIp === "string" && cfIp.trim()) ||
            (typeof xff === "string" && xff.split(",")[0].trim()) ||
            req.socket.remoteAddress ||
            "unknown";
        const cookies = (0, cookie_utils_1.parseCookies)(req.headers.cookie);
        const cookieToken = cookies.session_token;
        lobbyManager.handleConnection(ws, ip, cookieToken);
    });
    // Reclaim stale half-open WebSocket connections
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((client) => {
            if (aliveSockets.get(client) === false) {
                client.terminate();
                return;
            }
            aliveSockets.set(client, false);
            if (client.readyState === client.OPEN) {
                client.ping();
            }
        });
    }, 25000);
    heartbeatInterval.unref?.();
    wss.on("close", () => {
        clearInterval(heartbeatInterval);
    });
    server.listen(config_1.CONFIG.PORT, config_1.CONFIG.HOST, async () => {
        const lanIps = getLocalLanIps();
        console.log("=======================================================");
        console.log(`Western-gun-game Server is RUNNING on Port: ${config_1.CONFIG.PORT}`);
        console.log(`- Local Access:   http://localhost:${config_1.CONFIG.PORT}`);
        for (const ip of lanIps) {
            console.log(`- LAN (Wi-Fi):    http://${ip}:${config_1.CONFIG.PORT}`);
        }
        if (config_1.CONFIG.ENABLE_TUNNEL) {
            try {
                console.log("- Cloudflare:     Initializing Quick Tunnel...");
                const tunnelUrl = await tunnelManager.startTunnel(config_1.CONFIG.PORT);
                console.log(`- Cloudflare:     ${tunnelUrl} (Public Internet Access)`);
            }
            catch (err) {
                console.warn(`- Cloudflare:     Failed to initialize tunnel (${err.message})`);
            }
        }
        console.log("=======================================================");
    });
}
startServer();
