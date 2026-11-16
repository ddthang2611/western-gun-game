import { Router, Request, Response } from "express";
import { SessionRepository } from "../db/session_repository";
import { RateLimiter } from "./rate_limiter";
import { parseCookies } from "./cookie_utils";

export const authRouter = Router();

// Resolve client IP behind Cloudflare Tunnel or direct socket
function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) return cfIp.trim();
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
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
  if (!name || typeof name !== "string" || !pin || typeof pin !== "string") {
    return res.status(400).json({ success: false, message: "Player name and PIN are required." });
  }

  try {
    const session = await SessionRepository.getInstance().authenticatePlayer(
      name.trim(),
      pin.trim(),
      undefined,
      ip
    );
    rateLimiter.resetFailedAttempt("pin_auth", ip);

    // HttpOnly session cookie, SameSite=Lax
    res.setHeader(
      "Set-Cookie",
      `session_token=${session.sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
    );

    return res.json({
      success: true,
      user: { playerId: session.playerId, name: session.name },
    });
  } catch (err: any) {
    rateLimiter.recordFailedAttempt("pin_auth", ip, 5, 15 * 60 * 1000);
    return res.status(401).json({ success: false, message: err.message || "Authentication failed." });
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
    const player = SessionRepository.getInstance().getPlayerByToken(token);
    if (player) {
      SessionRepository.getInstance().setPlayerOffline(player.player_id);
    }
  }

  res.setHeader("Set-Cookie", "session_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  return res.json({ success: true });
});
