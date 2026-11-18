export interface WsMessage<T = Record<string, unknown>> {
  type: string;
  payload?: T;
}

export type WsListener = (msg: WsMessage) => void;
export type WsStatusListener = (connected: boolean) => void;

const PING_INTERVAL_MS = 20000;
const PONG_TIMEOUT_MS = 10000;
const MAX_RECONNECT_DELAY_MS = 5000;
const MAX_QUEUE_SIZE = 50;

function buildWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

// Persistent reconnecting WebSocket manager
class GameWsClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<WsListener>();
  private statusListeners = new Set<WsStatusListener>();
  private outboundQueue: string[] = [];
  private shouldReconnect = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pongTimeoutTimer: number | null = null;
  private connected = false;

  public isConnected(): boolean {
    return this.connected;
  }

  public connectSocket(): void {
    this.shouldReconnect = true;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.clearReconnectTimer();
    const ws = new WebSocket(buildWsUrl());
    this.socket = ws;

    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.reconnectAttempt = 0;
      this.setConnected(true);
      this.flushQueue(ws);
      this.startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      if (this.socket !== ws) return;
      try {
        const parsed = JSON.parse(String(event.data)) as WsMessage;
        if (!parsed || typeof parsed.type !== "string") return;
        if (parsed.type === "PONG") {
          this.clearPongTimeout();
          return;
        }
        for (const listener of Array.from(this.listeners)) {
          try {
            listener(parsed);
          } catch {
            // Isolate subscriber callback failures
          }
        }
      } catch {
        // Ignore unparseable WS frames
      }
    };

    ws.onerror = () => {
      if (this.socket !== ws) return;
      this.setConnected(false);
    };

    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.clearHeartbeat();
      this.setConnected(false);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };
  }

  public disconnectSocket(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.clearHeartbeat();
    this.outboundQueue = [];
    this.reconnectAttempt = 0;

    const ws = this.socket;
    this.socket = null;
    if (ws) {
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => ws.close(1000);
      } else {
        ws.onopen = null;
        if (ws.readyState === WebSocket.OPEN) {
          ws.close(1000);
        }
      }
    }
    this.setConnected(false);
  }

  public sendMessage(type: string, payload: Record<string, unknown> = {}): boolean {
    const raw = JSON.stringify({ type, payload });

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
      return true;
    }

    if (this.socket?.readyState === WebSocket.CONNECTING) {
      if (type !== "PING") {
        if (this.outboundQueue.length >= MAX_QUEUE_SIZE) {
          this.outboundQueue.shift();
        }
        this.outboundQueue.push(raw);
      }
      return true;
    }

    if (this.shouldReconnect && this.reconnectTimer === null) {
      this.connectSocket();
    }
    return false;
  }

  public subscribe(listener: WsListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeStatus(listener: WsStatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private setConnected(next: boolean): void {
    if (this.connected === next) return;
    this.connected = next;
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(next);
      } catch {
        // Isolate status listener errors
      }
    }
  }

  private flushQueue(ws: WebSocket): void {
    while (this.outboundQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
      const next = this.outboundQueue.shift();
      if (next) {
        ws.send(next);
      }
    }
  }

  private startHeartbeat(ws: WebSocket): void {
    this.clearHeartbeat();
    this.pingTimer = window.setInterval(() => {
      if (this.socket !== ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "PING", payload: {} }));
      this.clearPongTimeout();
      this.pongTimeoutTimer = window.setTimeout(() => {
        if (this.socket !== ws) return;
        this.socket = null;
        this.clearHeartbeat();
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close(4000, "Pong timeout");
        } catch {
          // Ignore close errors
        }
        this.setConnected(false);
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(
      MAX_RECONNECT_DELAY_MS,
      1000 * Math.pow(2, this.reconnectAttempt)
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connectSocket();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearPongTimeout(): void {
    if (this.pongTimeoutTimer !== null) {
      window.clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
  }

  private clearHeartbeat(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimeout();
  }
}

export const wsClient = new GameWsClient();

export function disconnectSocket(): void {
  wsClient.disconnectSocket();
}
