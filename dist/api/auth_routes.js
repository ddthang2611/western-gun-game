"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const session_repository_1 = require("../db/session_repository");
const rate_limiter_1 = require("./rate_limiter");
const cookie_utils_1 = require("./cookie_utils");
exports.authRouter = (0, express_1.Router)();
// Resolve client IP behind Cloudflare Tunnel or direct socket
function getClientIp(req) {
    const cfIp = req.headers["cf-connecting-ip"];
    if (typeof cfIp === "string" && cfIp.trim())
        return cfIp.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim())
        return xff.split(",")[0].trim();
    return req.socket.remoteAddress || "unknown";
}
// PIN Authentication with brute-force rate limiter (VULN-01/VULN-03)
exports.authRouter.post("/session", async (req, res) => {
    const ip = getClientIp(req);
    const rateLimiter = rate_limiter_1.RateLimiter.getInstance();
    if (rateLimiter.isRateLimited("pin_auth", ip)) {
        const remaining = rateLimiter.getRemainingLockSeconds("pin_auth", ip);
        return res.status(429).json({
            success: false,
            message: `Too many failed PIN attempts. Locked for ${remaining} seconds.`,
        });
    }
    const { name, pin } = req.body || {};
    if (!name || typeof name !== "string" || !pin || typeof pin !== "string") {
        return res.status(400).json({ success: false, message: "Player name and PIN are required." });
    }
    try {
        const session = await session_repository_1.SessionRepository.getInstance().authenticatePlayer(name.trim(), pin.trim(), undefined, ip);
        rateLimiter.resetFailedAttempt("pin_auth", ip);
        // HttpOnly session cookie, SameSite=Lax
        res.setHeader("Set-Cookie", `session_token=${session.sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
        return res.json({
            success: true,
            user: { playerId: session.playerId, name: session.name },
        });
    }
    catch (err) {
        rateLimiter.recordFailedAttempt("pin_auth", ip, 5, 15 * 60 * 1000);
        return res.status(401).json({ success: false, message: err.message || "Authentication failed." });
    }
});
exports.authRouter.get("/me", (req, res) => {
    const cookies = (0, cookie_utils_1.parseCookies)(req.headers.cookie);
    const token = cookies.session_token;
    if (!token) {
        return res.json({ authenticated: false });
    }
    const player = session_repository_1.SessionRepository.getInstance().getPlayerByToken(token);
    if (!player) {
        return res.json({ authenticated: false });
    }
    return res.json({
        authenticated: true,
        user: { playerId: player.player_id, name: player.player_name },
    });
});
exports.authRouter.post("/logout", (req, res) => {
    const cookies = (0, cookie_utils_1.parseCookies)(req.headers.cookie);
    const token = cookies.session_token;
    if (token) {
        const player = session_repository_1.SessionRepository.getInstance().getPlayerByToken(token);
        if (player) {
            session_repository_1.SessionRepository.getInstance().setPlayerOffline(player.player_id);
        }
    }
    res.setHeader("Set-Cookie", "session_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return res.json({ success: true });
});
