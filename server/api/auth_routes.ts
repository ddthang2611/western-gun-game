import { Router, Request, Response } from "express";
import { SessionRepository } from "../db/session_repository";
import { LobbyManager } from "../ws/lobby_handler";
import { RateLimiter } from "./rate_limiter";
import { parseCookies } from "./cookie_utils";
import { getClientIp, isHttpsRequest } from "./request_utils";

export const authRouter = Router();

const SAFE_AUTH_ERRORS = new Set([
  "Invalid PIN.",
  "Player name already exists. Please enter the correct PIN or choose a different name.",
]);

function buildSessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
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
authRouter.post("/session", async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  const rateLimiter = RateLimiter.getInstance();

  if (rateLimiter.isRateLimited("pin_auth", ip)) {
    const remaining = rateLimiter.getRemainingLockSeconds("pin_auth", ip);
    return res.status(429).json({
      success: false,
      message: `Too many failed PIN attempts. Locked for ${remaining} seconds.`,
    });
  }

  const { name, pin } = req.body || {};
  if (typeof name !== "string" || typeof pin !== "string") {
    return res.status(400).json({ success: false, message: "Player name and PIN are required." });
  }

  const cleanName = name.trim();
  const cleanPin = pin.trim();
  if (cleanName.length < 1 || cleanName.length > 24) {
    return res.status(400).json({ success: false, message: "Player name must be 1-24 characters." });
  }
  if (cleanPin.length < 1 || cleanPin.length > 16) {
    return res.status(400).json({ success: false, message: "PIN must be 1-16 characters." });
  }

  try {
    const session = await SessionRepository.getInstance().authenticatePlayer(
      cleanName,
      cleanPin,
      undefined,
      ip
    );
    rateLimiter.resetFailedAttempt("pin_auth", ip);

    // HttpOnly session cookie, SameSite=Strict
    res.setHeader(
      "Set-Cookie",
      buildSessionCookie(session.sessionToken, 2592000, isHttpsRequest(req))
    );

    return res.json({
      success: true,
      user: { playerId: session.playerId, name: session.name },
    });
  } catch (err: any) {
    rateLimiter.recordFailedAttempt("pin_auth", ip, 5, 15 * 60 * 1000);
    const message = SAFE_AUTH_ERRORS.has(err?.message) ? err.message : "Authentication failed.";
    return res.status(401).json({ success: false, message });
  }
});

authRouter.get("/me", (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session_token;
  if (!token) {
    return res.json({ authenticated: false });
  }

  const player = SessionRepository.getInstance().getPlayerByToken(token);
  if (!player) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: { playerId: player.player_id, name: player.player_name },
  });
});

authRouter.post("/logout", (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.session_token;
  if (token) {
    const repo = SessionRepository.getInstance();
    const player = repo.getPlayerByToken(token);
    if (player) {
      repo.invalidateSession(player.player_id);
      LobbyManager.getInstance().disconnectPlayerSockets(player.player_id, "Signed out.");
    }
  }

  res.setHeader("Set-Cookie", buildSessionCookie("", 0, isHttpsRequest(req)));
  return res.json({ success: true });
});
