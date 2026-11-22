"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const session_repository_1 = require("../db/session_repository");
const lobby_handler_1 = require("../ws/lobby_handler");
const rate_limiter_1 = require("./rate_limiter");
const cookie_utils_1 = require("./cookie_utils");
const request_utils_1 = require("./request_utils");
exports.authRouter = (0, express_1.Router)();
const SAFE_AUTH_ERRORS = new Set([
    "Invalid PIN.",
    "Player name already exists. Please enter the correct PIN or choose a different name.",
]);
function buildSessionCookie(token, maxAgeSeconds, secure) {
    const parts = [
        `session_token=${token}`,
        "HttpOnly",
        "SameSite=Strict",
        "Path=/",
        `Max-Age=${maxAgeSeconds}`,
    ];
    if (secure) {
        parts.push("Secure");
    }
    return parts.join("; ");
}
// PIN Authentication with brute-force rate limiter (VULN-01/VULN-03)
exports.authRouter.post("/session", async (req, res) => {
    const ip = (0, request_utils_1.getClientIp)(req);
    const rateLimiter = rate_limiter_1.RateLimiter.getInstance();
    if (rateLimiter.isRateLimited("pin_auth", ip)) {
        const remaining = rateLimiter.getRemainingLockSeconds("pin_auth", ip);
        return res.status(429).json({
            success: false,
            code: "ACCOUNT_LOCKED",
            params: { seconds: remaining },
            message: `Too many failed PIN attempts. Locked for ${remaining} seconds.`,
        });
    }
    const { name, pin } = req.body || {};
    if (typeof name !== "string" || typeof pin !== "string") {
        return res.status(400).json({
            success: false,
            code: "PLAYER_NAME_AND_PIN_REQUIRED",
            message: "Player name and PIN are required.",
        });
    }
    const cleanName = name.trim();
    const cleanPin = pin.trim();
    if (cleanName.length < 1 || cleanName.length > 24) {
        return res.status(400).json({
            success: false,
            code: "PLAYER_NAME_LENGTH",
            message: "Player name must be 1-24 characters.",
        });
    }
    if (cleanPin.length < 1 || cleanPin.length > 16) {
        return res.status(400).json({
            success: false,
            code: "PIN_LENGTH",
            message: "PIN must be 1-16 characters.",
        });
    }
    try {
        const session = await session_repository_1.SessionRepository.getInstance().authenticatePlayer(cleanName, cleanPin, undefined, ip);
        rateLimiter.resetFailedAttempt("pin_auth", ip);
        // HttpOnly session cookie, SameSite=Strict
        res.setHeader("Set-Cookie", buildSessionCookie(session.sessionToken, 2592000, (0, request_utils_1.isHttpsRequest)(req)));
        return res.json({
            success: true,
            user: { playerId: session.playerId, name: session.name },
        });
    }
    catch (err) {
        rateLimiter.recordFailedAttempt("pin_auth", ip, 5, 15 * 60 * 1000);
        const message = SAFE_AUTH_ERRORS.has(err?.message) ? err.message : "Authentication failed.";
        return res.status(401).json({ success: false, message });
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
        const repo = session_repository_1.SessionRepository.getInstance();
        const player = repo.getPlayerByToken(token);
        if (player) {
            repo.invalidateSession(player.player_id);
            lobby_handler_1.LobbyManager.getInstance().disconnectPlayerSockets(player.player_id, "Signed out.");
        }
    }
    res.setHeader("Set-Cookie", buildSessionCookie("", 0, (0, request_utils_1.isHttpsRequest)(req)));
    return res.json({ success: true });
});
