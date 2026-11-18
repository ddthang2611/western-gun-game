"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketRateLimiter = void 0;
exports.sendSocketJson = sendSocketJson;
exports.isValidClientMessage = isValidClientMessage;
const ws_1 = require("ws");
// Send JSON message safely to open socket
function sendSocketJson(ws, type, payload) {
    if (ws.readyState !== ws_1.WebSocket.OPEN)
        return;
    try {
        ws.send(JSON.stringify({ type, payload }));
    }
    catch {
        // Ignore closed socket send errors
    }
}
// Validate plain-object WebSocket client envelope
function isValidClientMessage(raw) {
    return (typeof raw === "object" &&
        raw !== null &&
        !Array.isArray(raw) &&
        typeof raw.type === "string");
}
// Per-socket sliding-window rate limiter
class SocketRateLimiter {
    states = new WeakMap();
    maxMessages;
    maxPings;
    windowMs;
    constructor(maxMessages = 30, windowMs = 2000, maxPings = 20) {
        this.maxMessages = maxMessages;
        this.windowMs = windowMs;
        this.maxPings = maxPings;
    }
    allow(ws, messageType) {
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
exports.SocketRateLimiter = SocketRateLimiter;
