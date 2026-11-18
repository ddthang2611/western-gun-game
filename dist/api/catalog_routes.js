"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogRouter = void 0;
const express_1 = require("express");
const database_1 = require("../db/database");
const catalog_repository_1 = require("../db/catalog_repository");
const lobby_handler_1 = require("../ws/lobby_handler");
const rate_limiter_1 = require("./rate_limiter");
const request_utils_1 = require("./request_utils");
exports.catalogRouter = (0, express_1.Router)();
const SAFE_UNLOCK_MESSAGES = new Set([
    "Catalog database unavailable.",
    "Database metadata missing security keys.",
    "Invalid secret key. Access denied.",
]);
// Master DB Unlock endpoint with strict 3-attempt brute-force rate limiter (VULN-01/VULN-03)
exports.catalogRouter.post("/unlock", async (req, res) => {
    const ip = (0, request_utils_1.getClientIp)(req);
    const rateLimiter = rate_limiter_1.RateLimiter.getInstance();
    if (rateLimiter.isRateLimited("db_unlock", ip)) {
        const remaining = rateLimiter.getRemainingLockSeconds("db_unlock", ip);
        return res.status(429).json({
            success: false,
            message: `Too many failed database unlock attempts. IP temporarily locked for ${remaining} seconds.`,
        });
    }
    const { secretKey } = req.body || {};
    if (!secretKey || typeof secretKey !== "string" || !secretKey.trim()) {
        return res.status(400).json({ success: false, message: "Secret key is required." });
    }
    const wasAlreadyUnlocked = (0, database_1.isDatabaseUnlocked)();
    const result = await (0, database_1.unlockCatalogDatabaseAsync)(secretKey.trim());
    if (result.success) {
        rateLimiter.resetFailedAttempt("db_unlock", ip);
        const summary = catalog_repository_1.CatalogRepository.getInstance().getSummary();
        if (!wasAlreadyUnlocked) {
            lobby_handler_1.LobbyManager.getInstance().restoreFromPersistence();
            lobby_handler_1.LobbyManager.getInstance().broadcastMessage("DATABASE_UNLOCKED", summary);
        }
        return res.json({ success: true, message: result.message, summary });
    }
    else {
        rateLimiter.recordFailedAttempt("db_unlock", ip, 3, 30 * 60 * 1000);
        const message = SAFE_UNLOCK_MESSAGES.has(result.message)
            ? result.message
            : "Failed to unlock catalog database.";
        return res.status(401).json({ success: false, message });
    }
});
// Guard middleware to ensure catalog database is unlocked before serving game content
function requireUnlockedDatabase(_req, res, next) {
    if (!(0, database_1.isDatabaseUnlocked)()) {
        return res.status(423).json({ error: "Database is locked. Please unlock first." });
    }
    next();
}
exports.catalogRouter.get("/catalog/summary", requireUnlockedDatabase, (_req, res) => {
    res.json(catalog_repository_1.CatalogRepository.getInstance().getSummary());
});
exports.catalogRouter.get("/catalog/cards", requireUnlockedDatabase, (req, res) => {
    const pack = req.query.pack;
    const catalog = catalog_repository_1.CatalogRepository.getInstance();
    const cards = pack ? catalog.getCardsByPack(pack) : catalog.getAllCards();
    res.json(cards);
});
exports.catalogRouter.get("/catalog/characters", requireUnlockedDatabase, (req, res) => {
    const pack = req.query.pack;
    const catalog = catalog_repository_1.CatalogRepository.getInstance();
    const chars = pack ? catalog.getCharactersByPack(pack) : catalog.getAllCharacters();
    res.json(chars);
});
exports.catalogRouter.get("/catalog/roles", requireUnlockedDatabase, (_req, res) => {
    res.json(catalog_repository_1.CatalogRepository.getInstance().getAllRoles());
});
exports.catalogRouter.get("/catalog/events", requireUnlockedDatabase, (req, res) => {
    const pack = req.query.pack;
    const catalog = catalog_repository_1.CatalogRepository.getInstance();
    const events = pack ? catalog.getEventsByPack(pack) : catalog.getAllEvents();
    res.json(events);
});
exports.catalogRouter.get("/catalog/symbols", requireUnlockedDatabase, (_req, res) => {
    res.json(catalog_repository_1.CatalogRepository.getInstance().getAllSymbols());
});
