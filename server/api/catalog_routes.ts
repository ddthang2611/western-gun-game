import { Router, Request, Response } from "express";
import { isDatabaseUnlocked, unlockCatalogDatabaseAsync } from "../db/database";
import { CatalogRepository } from "../db/catalog_repository";
import { LobbyManager } from "../ws/lobby_handler";
import { RateLimiter } from "./rate_limiter";

export const catalogRouter = Router();

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

// Master DB Unlock endpoint with strict 3-attempt brute-force rate limiter (VULN-01/VULN-03)
catalogRouter.post("/unlock", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rateLimiter = RateLimiter.getInstance();

  if (rateLimiter.isRateLimited("db_unlock", ip)) {
    const remaining = rateLimiter.getRemainingLockSeconds("db_unlock", ip);
    return res.status(429).json({
      success: false,
      message: `Too many failed database unlock attempts. IP temporarily locked for ${remaining} seconds.`,
    });
  }

  const { secretKey } = req.body || {};
  if (!secretKey || typeof secretKey !== "string") {
    return res.status(400).json({ success: false, message: "Secret key is required." });
  }

  const result = await unlockCatalogDatabaseAsync(secretKey.trim());
  if (result.success) {
    rateLimiter.resetFailedAttempt("db_unlock", ip);
    const summary = CatalogRepository.getInstance().getSummary();
    LobbyManager.getInstance().restoreFromPersistence();
    LobbyManager.getInstance().broadcastMessage("DATABASE_UNLOCKED", summary);
    return res.json({ success: true, message: result.message, summary });
  } else {
    rateLimiter.recordFailedAttempt("db_unlock", ip, 3, 30 * 60 * 1000);
    return res.status(401).json({ success: false, message: result.message });
  }
});

// Guard middleware to ensure catalog database is unlocked before serving game content
function requireUnlockedDatabase(_req: Request, res: Response, next: () => void) {
  if (!isDatabaseUnlocked()) {
    return res.status(423).json({ error: "Database is locked. Please unlock first." });
  }
  next();
}

catalogRouter.get("/catalog/summary", requireUnlockedDatabase, (_req: Request, res: Response) => {
  res.json(CatalogRepository.getInstance().getSummary());
});

catalogRouter.get("/catalog/cards", requireUnlockedDatabase, (req: Request, res: Response) => {
  const pack = req.query.pack as string | undefined;
  const catalog = CatalogRepository.getInstance();
  const cards = pack ? catalog.getCardsByPack(pack) : catalog.getAllCards();
  res.json(cards);
});

catalogRouter.get("/catalog/characters", requireUnlockedDatabase, (req: Request, res: Response) => {
  const pack = req.query.pack as string | undefined;
  const catalog = CatalogRepository.getInstance();
  const chars = pack ? catalog.getCharactersByPack(pack) : catalog.getAllCharacters();
  res.json(chars);
});

catalogRouter.get("/catalog/roles", requireUnlockedDatabase, (_req: Request, res: Response) => {
  res.json(CatalogRepository.getInstance().getAllRoles());
});

catalogRouter.get("/catalog/events", requireUnlockedDatabase, (req: Request, res: Response) => {
  const pack = req.query.pack as string | undefined;
  const catalog = CatalogRepository.getInstance();
  const events = pack ? catalog.getEventsByPack(pack) : catalog.getAllEvents();
  res.json(events);
});

catalogRouter.get("/catalog/symbols", requireUnlockedDatabase, (_req: Request, res: Response) => {
  res.json(CatalogRepository.getInstance().getAllSymbols());
});
