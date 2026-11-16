import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import readline from "readline";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { CONFIG } from "./config";
import { getRuntimeDatabase, isDatabaseUnlocked, unlockCatalogDatabase } from "./db/database";
import { CatalogRepository } from "./db/catalog_repository";
import { LobbyManager } from "./ws/lobby_handler";
import { TunnelManager } from "./tunnel/tunnel_manager";
import { authRouter } from "./api/auth_routes";
import { catalogRouter } from "./api/catalog_routes";
import { parseCookies } from "./api/cookie_utils";

export { parseCookies };

function getLocalLanIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
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
    getRuntimeDatabase();
  } catch (err: any) {
    console.error("Runtime database initialization failure:", err.message);
  }

  // Attempt auto-unlock using DB_SECRET_KEY in environment
  const autoUnlockResult = unlockCatalogDatabase(CONFIG.DB_SECRET_KEY || "");
  if (autoUnlockResult.success) {
    const summary = CatalogRepository.getInstance().getSummary();
    console.log(
      `Database auto-unlocked successfully: ${summary.cardsCount} cards, ${summary.charactersCount} characters, ${summary.rolesCount} roles (Schema v${summary.schemaVersion})`
    );
    LobbyManager.getInstance().restoreFromPersistence();
  } else {
    console.log("=======================================================");
    console.log("[Western Gun] Catalog database is currently LOCKED.");
    console.log("[Western Gun] Reason: " + autoUnlockResult.message);
    console.log("[Western Gun] Enter DB Secret Key in terminal or open Web UI to unlock.");
    console.log("=======================================================");

    // Initialize terminal readline prompt for direct console unlocking
    if (process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("Enter DB Secret Key: ", (answer) => {
        const manualResult = unlockCatalogDatabase(answer.trim());
        if (manualResult.success) {
          const summary = CatalogRepository.getInstance().getSummary();
          console.log(`Database unlocked from terminal: ${summary.cardsCount} cards loaded.`);
          LobbyManager.getInstance().restoreFromPersistence();
          LobbyManager.getInstance().broadcastMessage("DATABASE_UNLOCKED", summary);
          rl.close();
        } else {
          console.error("Incorrect DB Secret Key: " + manualResult.message);
          rl.close();
        }
      });
    }
  }

  const app = express();
  app.disable("x-powered-by");

  // Security Headers (SEC-02 & OWASP Top 10)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none';"
    );
    next();
  });

  // Dynamic origin validation preventing credential theft via reflected CORS (VULN-02)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || TunnelManager.getInstance().isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error("CORS policy violation: Untrusted origin blocked"));
        }
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: "16kb" }));

  // Static assets & Client build
  app.use("/assets", express.static(CONFIG.ASSETS_DIR));
  app.use(express.static(CONFIG.CLIENT_DIST));

  // Health check & Server Status
  app.get("/api/status", (_req, res) => {
    const unlocked = isDatabaseUnlocked();
    res.json({
      status: unlocked ? "ready" : "locked",
      requiresUnlock: !unlocked,
      port: CONFIG.PORT,
      timestamp: Date.now(),
      lanIps: getLocalLanIps(),
      tunnelUrl: TunnelManager.getInstance().getActiveUrl(),
    });
  });

  app.get("/api/health", (_req, res) => {
    const unlocked = isDatabaseUnlocked();
    res.json({
      status: unlocked ? "ok" : "locked",
      port: CONFIG.PORT,
      timestamp: Date.now(),
      lanIps: getLocalLanIps(),
      tunnelUrl: TunnelManager.getInstance().getActiveUrl(),
    });
  });

  // Modular API routes
  app.use("/api/auth", authRouter);
  app.use("/api", catalogRouter);

  // SPA fallback for /dev-test UI sandbox route
  app.get("/dev-test", (_req, res) => {
    const indexHtml = path.join(CONFIG.CLIENT_DIST, "index.html");
    if (fs.existsSync(indexHtml)) {
      res.sendFile(indexHtml);
      return;
    }
    res.status(404).send("Client build not found. Run npm --prefix client run build or open Vite dev server at /dev-test.");
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const lobbyManager = LobbyManager.getInstance();
  const tunnelManager = TunnelManager.getInstance();

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

  const aliveSockets = new WeakMap<any, boolean>();

  wss.on("connection", (ws, req) => {
    aliveSockets.set(ws, true);
    ws.on("pong", () => {
      aliveSockets.set(ws, true);
    });
    const cfIp = req.headers["cf-connecting-ip"];
    const xff = req.headers["x-forwarded-for"];
    const ip =
      (typeof cfIp === "string" && cfIp.trim()) ||
      (typeof xff === "string" && xff.split(",")[0].trim()) ||
      req.socket.remoteAddress ||
      "unknown";
    const cookies = parseCookies(req.headers.cookie);
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

  server.listen(CONFIG.PORT, CONFIG.HOST, async () => {
    const lanIps = getLocalLanIps();
    console.log("=======================================================");
    console.log(`Western-gun-game Server is RUNNING on Port: ${CONFIG.PORT}`);
    console.log(`- Local Access:   http://localhost:${CONFIG.PORT}`);
    for (const ip of lanIps) {
      console.log(`- LAN (Wi-Fi):    http://${ip}:${CONFIG.PORT}`);
    }

    if (CONFIG.ENABLE_TUNNEL) {
      try {
        console.log("- Cloudflare:     Initializing Quick Tunnel...");
        const tunnelUrl = await tunnelManager.startTunnel(CONFIG.PORT);
        console.log(`- Cloudflare:     ${tunnelUrl} (Public Internet Access)`);
      } catch (err: any) {
        console.warn(`- Cloudflare:     Failed to initialize tunnel (${err.message})`);
      }
    }
    console.log("=======================================================");
  });
}

startServer();
