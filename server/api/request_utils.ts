import type { IncomingMessage } from "http";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// Check whether peer socket is loopback
export function isLoopbackPeer(req: IncomingMessage): boolean {
  const remote = req.socket?.remoteAddress || "";
  return LOOPBACK_ADDRESSES.has(remote);
}

// Resolve client IP trusting loopback proxy headers only
export function getClientIp(req: IncomingMessage): string {
  const remote = req.socket?.remoteAddress || "unknown";
  if (!isLoopbackPeer(req)) {
    return remote;
  }

  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string" && cfIp.trim()) {
    return cfIp.trim();
  }

  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }

  return remote;
}

// Detect TLS or trusted HTTPS reverse proxy
export function isHttpsRequest(req: IncomingMessage): boolean {
  const socket = req.socket as { encrypted?: boolean } | undefined;
  if (socket?.encrypted) {
    return true;
  }
  if (!isLoopbackPeer(req)) {
    return false;
  }

  const xfProto = req.headers["x-forwarded-proto"];
  if (typeof xfProto === "string") {
    return xfProto.split(",")[0].trim().toLowerCase() === "https";
  }
  if (Array.isArray(xfProto) && xfProto.length > 0) {
    return xfProto[0].split(",")[0].trim().toLowerCase() === "https";
  }
  return false;
}
