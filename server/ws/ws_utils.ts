import { WebSocket } from "ws";

// Send JSON message safely to open socket
export function sendSocketJson(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, payload }));
  } catch {
    // Ignore closed socket send errors
  }
}

// Validate plain-object WebSocket client envelope
export function isValidClientMessage(
  raw: unknown
): raw is { type: string; payload?: Record<string, any> } {
  return (
    typeof raw === "object" &&
    raw !== null &&
    !Array.isArray(raw) &&
    typeof (raw as { type?: unknown }).type === "string"
  );
}

interface SocketWindowState {
  messages: number[];
  pings: number[];
}

// Per-socket sliding-window rate limiter
export class SocketRateLimiter {
  private states = new WeakMap<WebSocket, SocketWindowState>();
  private readonly maxMessages: number;
  private readonly maxPings: number;
  private readonly windowMs: number;

  constructor(maxMessages = 30, windowMs = 2000, maxPings = 20) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
    this.maxPings = maxPings;
  }

  public allow(ws: WebSocket, messageType: string): boolean {
    const now = Date.now();
    let state = this.states.get(ws);
    if (!state) {
      state = { messages: [], pings: [] };
      this.states.set(ws, state);
    }

    const cutoff = now - this.windowMs;
    if (messageType === "PING") {
      state.pings = state.pings.filter((ts) => ts > cutoff);
      if (state.pings.length >= this.maxPings) {
        return false;
      }
      state.pings.push(now);
      return true;
    }

    state.messages = state.messages.filter((ts) => ts > cutoff);
    if (state.messages.length >= this.maxMessages) {
      return false;
    }
    state.messages.push(now);
    return true;
  }
}
