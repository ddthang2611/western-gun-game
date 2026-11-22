"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyManager = void 0;
const ws_1 = require("ws");
const session_repository_1 = require("../db/session_repository");
const rate_limiter_1 = require("../api/rate_limiter");
const cookie_utils_1 = require("../api/cookie_utils");
const game_handler_1 = require("./game_handler");
const expansion_config_1 = require("../engine/events/expansion_config");
const ws_utils_1 = require("./ws_utils");
class LobbyManager {
    static instance;
    connections = new Map();
    playerSockets = new Map();
    socketMeta = new Map();
    tokenToPlayerId = new Map();
    kickedPlayerIds = new Set();
    disconnectTimers = new Map();
    wsRateLimiter = new ws_utils_1.SocketRateLimiter(30, 2000, 20);
    playerNames = new Map();
    getDefaultSettings() {
        return {
            dualCharacterEnabled: false,
            dualCharacterHpRule: "strict",
            expansions: ["base", "dodge_city"],
        };
    }
    // Clear match and room state cleanly
    resetRoomToEmptyState() {
        game_handler_1.GameSessionManager.getInstance().endSession(this.state.roomId);
        this.kickedPlayerIds.clear();
        this.state.roomExists = false;
        this.state.hostId = "";
        this.state.roomName = "Saloon Table #1";
        this.state.status = "waiting";
        this.state.players = [];
        this.state.settings = this.getDefaultSettings();
        this.persistLobbyState();
    }
    getHostId() {
        return this.state.hostId;
    }
    state = {
        roomExists: false,
        roomId: "western_main_room",
        roomName: "Saloon Table #1",
        hostId: "",
        status: "waiting",
        players: [],
        settings: this.getDefaultSettings(),
        expansionCatalog: expansion_config_1.EXPANSION_CONFIG,
        minPlayers: Number(process.env.MIN_PLAYERS || 3),
        maxPlayers: 8,
    };
    clearDisconnectTimer(playerId) {
        const timer = this.disconnectTimers.get(playerId);
        if (timer) {
            clearTimeout(timer);
            this.disconnectTimers.delete(playerId);
        }
    }
    hasOpenSocket(playerId) {
        const set = this.playerSockets.get(playerId);
        if (!set)
            return false;
        for (const sock of set) {
            if (sock.readyState === ws_1.WebSocket.OPEN) {
                return true;
            }
        }
        return false;
    }
    releaseTokenMapping(ws, token) {
        if (this.connections.get(token) !== ws)
            return;
        let replacement = null;
        for (const [otherWs, otherMeta] of this.socketMeta.entries()) {
            if (otherWs !== ws && otherMeta.token === token && otherWs.readyState === ws_1.WebSocket.OPEN) {
                replacement = otherWs;
                break;
            }
        }
        if (replacement) {
            this.connections.set(token, replacement);
        }
        else {
            this.connections.delete(token);
            this.tokenToPlayerId.delete(token);
        }
    }
    collectPlayerSockets(playerId) {
        const recipients = new Set(this.playerSockets.get(playerId) || []);
        for (const [token, pId] of this.tokenToPlayerId.entries()) {
            if (pId === playerId) {
                const sock = this.connections.get(token);
                if (sock) {
                    recipients.add(sock);
                }
            }
        }
        for (const [sock, meta] of this.socketMeta.entries()) {
            if (meta.playerId === playerId) {
                recipients.add(sock);
            }
        }
        return recipients;
    }
    // Bind socket to player session
    bindSocket(ws, token, playerId) {
        this.clearDisconnectTimer(playerId);
        const prev = this.socketMeta.get(ws);
        if (prev?.token && prev.token !== token) {
            this.releaseTokenMapping(ws, prev.token);
        }
        if (prev?.playerId && prev.playerId !== playerId) {
            const prevSet = this.playerSockets.get(prev.playerId);
            if (prevSet) {
                prevSet.delete(ws);
                if (prevSet.size === 0) {
                    this.playerSockets.delete(prev.playerId);
                }
            }
        }
        this.socketMeta.set(ws, { token, playerId });
        this.tokenToPlayerId.set(token, playerId);
        this.connections.set(token, ws);
        let set = this.playerSockets.get(playerId);
        if (!set) {
            set = new Set();
            this.playerSockets.set(playerId, set);
        }
        set.add(ws);
    }
    // Detach socket from session maps
    unbindSocket(ws) {
        const meta = this.socketMeta.get(ws) || { token: null, playerId: null };
        this.socketMeta.delete(ws);
        if (meta.token) {
            this.releaseTokenMapping(ws, meta.token);
        }
        if (meta.playerId) {
            const set = this.playerSockets.get(meta.playerId);
            if (set) {
                set.delete(ws);
                if (set.size === 0) {
                    this.playerSockets.delete(meta.playerId);
                }
            }
        }
        return meta;
    }
    resolvePlayerId(ws, currentToken) {
        const boundId = this.socketMeta.get(ws)?.playerId;
        if (boundId)
            return boundId;
        if (currentToken)
            return this.tokenToPlayerId.get(currentToken);
        return undefined;
    }
    static getInstance() {
        if (!LobbyManager.instance) {
            LobbyManager.instance = new LobbyManager();
        }
        return LobbyManager.instance;
    }
    handleConnection(ws, ip, cookieToken) {
        let currentToken = null;
        this.socketMeta.set(ws, { token: null, playerId: null });
        // Automatic session recovery if valid HttpOnly cookie is present (SEC-01)
        if (cookieToken) {
            const existingPlayer = session_repository_1.SessionRepository.getInstance().getPlayerByToken(cookieToken);
            if (existingPlayer) {
                if (this.kickedPlayerIds.has(existingPlayer.player_id)) {
                    this.send(ws, "PLAYER_KICKED", {
                        playerId: existingPlayer.player_id,
                        reason: "You were removed from the room by the Host.",
                    });
                    ws.close(4003, "Kicked by Host");
                    return;
                }
                currentToken = cookieToken;
                this.playerNames.set(existingPlayer.player_id, existingPlayer.player_name);
                this.bindSocket(ws, currentToken, existingPlayer.player_id);
                if (this.state.roomExists && this.state.players.some((p) => p.id === existingPlayer.player_id)) {
                    this.addOrRestorePlayer(existingPlayer.player_id, existingPlayer.player_name);
                    this.persistLobbyState();
                }
                this.send(ws, "AUTH_SUCCESS", {
                    playerId: existingPlayer.player_id,
                    name: existingPlayer.player_name,
                });
                this.broadcastLobbyState();
                // Sync active match snapshot
                const gameManager = game_handler_1.GameSessionManager.getInstance();
                const activeEngine = gameManager.getSession(this.state.roomId);
                if (activeEngine && this.state.players.some((p) => p.id === existingPlayer.player_id)) {
                    gameManager.sendPlayerSnapshot(activeEngine, existingPlayer.player_id, this.state.roomId, this);
                }
            }
            else {
                this.send(ws, "AUTH_REQUIRED", {
                    reason: "Session expired or invalid. Please sign in again.",
                });
            }
        }
        let messageQueue = Promise.resolve();
        ws.on("message", (data) => {
            messageQueue = messageQueue
                .then(async () => {
                if (ws.readyState !== ws_1.WebSocket.OPEN)
                    return;
                let parsed;
                try {
                    parsed = JSON.parse(data.toString());
                }
                catch {
                    this.send(ws, "ERROR", { code: "INVALID_MESSAGE_FORMAT", message: "Invalid message format" });
                    return;
                }
                if (!(0, ws_utils_1.isValidClientMessage)(parsed)) {
                    this.send(ws, "ERROR", { code: "INVALID_MESSAGE_FORMAT", message: "Invalid message format" });
                    return;
                }
                if (!this.wsRateLimiter.allow(ws, parsed.type)) {
                    this.send(ws, "ERROR", { code: "RATE_LIMIT_EXCEEDED", message: "Rate limit exceeded. Slow down." });
                    return;
                }
                currentToken = await this.handleMessage(ws, parsed, ip, currentToken, cookieToken);
            })
                .catch((err) => {
                this.send(ws, "ERROR", { message: err?.message || "Invalid message format" });
            });
        });
        ws.on("error", () => {
            this.handleDisconnect(ws);
        });
        ws.on("close", () => {
            this.handleDisconnect(ws);
        });
    }
    async handleMessage(ws, msg, ip, currentToken, cookieToken) {
        switch (msg.type) {
            case "AUTH_JOIN": {
                const rateLimiter = rate_limiter_1.RateLimiter.getInstance();
                if (rateLimiter.isRateLimited("pin_auth", ip)) {
                    const remaining = rateLimiter.getRemainingLockSeconds("pin_auth", ip);
                    throw new Error(`Too many failed PIN attempts. Locked for ${remaining} seconds.`);
                }
                const { name, pin, sessionToken } = msg.payload || {};
                if (typeof name !== "string" || typeof pin !== "string") {
                    throw new Error("Player name and PIN are required.");
                }
                const cleanName = name.trim();
                const cleanPin = pin.trim();
                if (cleanName.length < 1 || cleanName.length > 24) {
                    throw new Error("Player name must be 1-24 characters.");
                }
                if (cleanPin.length < 1 || cleanPin.length > 16) {
                    throw new Error("PIN must be 1-16 characters.");
                }
                const effectiveToken = (0, cookie_utils_1.extractSessionToken)(sessionToken) || cookieToken;
                let session;
                try {
                    session = await session_repository_1.SessionRepository.getInstance().authenticatePlayer(cleanName, cleanPin, effectiveToken, ip);
                    rateLimiter.resetFailedAttempt("pin_auth", ip);
                }
                catch (err) {
                    rateLimiter.recordFailedAttempt("pin_auth", ip, 5, 15 * 60 * 1000);
                    throw err;
                }
                if (ws.readyState !== ws_1.WebSocket.OPEN) {
                    if (!this.hasOpenSocket(session.playerId)) {
                        try {
                            session_repository_1.SessionRepository.getInstance().setPlayerOffline(session.playerId);
                        }
                        catch {
                            // Ignore DB cleanup error
                        }
                    }
                    return currentToken;
                }
                currentToken = session.sessionToken;
                this.kickedPlayerIds.delete(session.playerId);
                this.playerNames.set(session.playerId, session.name);
                this.bindSocket(ws, currentToken, session.playerId);
                if (this.state.roomExists && this.state.players.some((p) => p.id === session.playerId)) {
                    this.addOrRestorePlayer(session.playerId, session.name);
                    this.persistLobbyState();
                }
                this.send(ws, "AUTH_SUCCESS", {
                    playerId: session.playerId,
                    name: session.name,
                });
                this.broadcastLobbyState();
                // If game is in progress, sync game state immediately
                const gameManager = game_handler_1.GameSessionManager.getInstance();
                const activeEngine = gameManager.getSession(this.state.roomId);
                if (activeEngine) {
                    gameManager.sendPlayerSnapshot(activeEngine, session.playerId, this.state.roomId, this);
                }
                return currentToken;
            }
            case "RESTORE_SESSION": {
                const payloadToken = (0, cookie_utils_1.extractSessionToken)(msg.payload?.sessionToken);
                const token = payloadToken || cookieToken || currentToken;
                if (!token) {
                    if (!currentToken) {
                        this.send(ws, "AUTH_REQUIRED", {
                            reason: "Session expired or invalid. Please sign in again.",
                        });
                    }
                    return currentToken;
                }
                const player = session_repository_1.SessionRepository.getInstance().getPlayerByToken(token);
                if (!player) {
                    if (!currentToken) {
                        this.send(ws, "AUTH_REQUIRED", {
                            reason: "Session expired or invalid. Please sign in again.",
                        });
                    }
                    return currentToken;
                }
                if (this.kickedPlayerIds.has(player.player_id)) {
                    this.send(ws, "PLAYER_KICKED", {
                        playerId: player.player_id,
                        reason: "You were removed from the room by the Host.",
                    });
                    ws.close(4003, "Kicked by Host");
                    return null;
                }
                currentToken = token;
                this.playerNames.set(player.player_id, player.player_name);
                this.bindSocket(ws, token, player.player_id);
                if (this.state.roomExists && this.state.players.some((p) => p.id === player.player_id)) {
                    this.addOrRestorePlayer(player.player_id, player.player_name);
                    this.persistLobbyState();
                }
                this.send(ws, "AUTH_SUCCESS", {
                    playerId: player.player_id,
                    name: player.player_name,
                });
                this.broadcastLobbyState();
                // Sync active match snapshot
                const gameManager = game_handler_1.GameSessionManager.getInstance();
                const activeEngine = gameManager.getSession(this.state.roomId);
                if (activeEngine && this.state.players.some((p) => p.id === player.player_id)) {
                    gameManager.sendPlayerSnapshot(activeEngine, player.player_id, this.state.roomId, this);
                }
                return currentToken;
            }
            case "CREATE_ROOM": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!currentToken || !playerId) {
                    throw new Error("Authenticate before creating a room.");
                }
                if (this.state.roomExists) {
                    throw new Error("A room already exists. Please join the active room.");
                }
                const rawName = typeof msg.payload?.roomName === "string" ? msg.payload.roomName.trim() : "";
                const playerName = this.playerNames.get(playerId) ||
                    session_repository_1.SessionRepository.getInstance().getPlayerByToken(currentToken)?.player_name ||
                    "Host";
                game_handler_1.GameSessionManager.getInstance().endSession(this.state.roomId);
                this.kickedPlayerIds.clear();
                this.state.roomExists = true;
                this.state.roomId = "western_main_room";
                this.state.roomName = rawName ? rawName.slice(0, 32) : "Saloon Table #1";
                this.state.hostId = playerId;
                this.state.status = "waiting";
                this.state.settings = this.getDefaultSettings();
                this.state.players = [
                    {
                        id: playerId,
                        name: playerName,
                        seatIndex: 0,
                        isHost: true,
                        isReady: true,
                        isOnline: true,
                    },
                ];
                this.persistLobbyState();
                this.broadcastLobbyState();
                return currentToken;
            }
            case "JOIN_ROOM": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!currentToken || !playerId) {
                    throw new Error("Authenticate before joining a room.");
                }
                if (!this.state.roomExists) {
                    throw new Error("No active room yet. Create a room first.");
                }
                if (this.kickedPlayerIds.has(playerId)) {
                    throw new Error("You were removed from the room by the Host.");
                }
                const existingMember = this.state.players.some((p) => p.id === playerId);
                if (this.state.status === "in_game" && !existingMember) {
                    throw new Error("Match already in progress.");
                }
                const playerName = this.playerNames.get(playerId) ||
                    session_repository_1.SessionRepository.getInstance().getPlayerByToken(currentToken)?.player_name ||
                    "Player";
                this.addOrRestorePlayer(playerId, playerName);
                this.persistLobbyState();
                this.broadcastLobbyState();
                const gameManager = game_handler_1.GameSessionManager.getInstance();
                const activeEngine = gameManager.getSession(this.state.roomId);
                if (activeEngine && existingMember) {
                    gameManager.sendPlayerSnapshot(activeEngine, playerId, this.state.roomId, this);
                }
                return currentToken;
            }
            case "LEAVE_ROOM": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!playerId || !this.state.roomExists)
                    return currentToken;
                if (this.state.status !== "waiting") {
                    throw new Error("Cannot leave room while a match is in progress.");
                }
                const idx = this.state.players.findIndex((p) => p.id === playerId);
                if (idx === -1)
                    return currentToken;
                if (playerId === this.state.hostId && this.state.players.length > 1) {
                    throw new Error("Host cannot leave while other players are waiting.");
                }
                this.state.players.splice(idx, 1);
                this.state.players.forEach((p, seatIdx) => {
                    p.seatIndex = seatIdx;
                });
                if (this.state.players.length === 0) {
                    this.resetRoomToEmptyState();
                }
                else {
                    this.persistLobbyState();
                }
                this.broadcastLobbyState();
                return currentToken;
            }
            case "SET_READY": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!playerId) {
                    throw new Error("Session not authenticated. Please reconnect or sign in again.");
                }
                const player = this.state.players.find((p) => p.id === playerId);
                if (!player) {
                    throw new Error("Join the room before toggling ready state.");
                }
                player.isOnline = true;
                player.isReady = player.isHost ? true : Boolean(msg.payload?.isReady);
                this.broadcastLobbyState();
                return currentToken;
            }
            case "UPDATE_SETTINGS": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!playerId)
                    return currentToken;
                if (playerId === this.state.hostId && msg.payload && typeof msg.payload === "object") {
                    const raw = msg.payload;
                    const sanitized = {};
                    if (typeof raw.dualCharacterEnabled === "boolean") {
                        sanitized.dualCharacterEnabled = raw.dualCharacterEnabled;
                    }
                    if (["strict", "balanced", "juggernaut"].includes(raw.dualCharacterHpRule)) {
                        sanitized.dualCharacterHpRule = raw.dualCharacterHpRule;
                    }
                    if (Array.isArray(raw.expansions)) {
                        sanitized.expansions = (0, expansion_config_1.filterActiveExpansions)(raw.expansions.map((e) => String(e)));
                    }
                    this.state.settings = { ...this.state.settings, ...sanitized };
                    this.persistLobbyState();
                    this.broadcastLobbyState();
                }
                return currentToken;
            }
            case "KICK_PLAYER": {
                const requesterId = this.resolvePlayerId(ws, currentToken);
                if (!requesterId) {
                    throw new Error("Session not authenticated.");
                }
                if (requesterId !== this.state.hostId) {
                    throw new Error("Only the Host can kick players.");
                }
                if (this.state.status !== "waiting") {
                    throw new Error("Cannot kick players during an active match.");
                }
                const targetPlayerId = msg.payload?.playerId;
                if (!targetPlayerId || typeof targetPlayerId !== "string") {
                    throw new Error("Target player ID is required.");
                }
                if (targetPlayerId === this.state.hostId) {
                    throw new Error("Host cannot kick themselves.");
                }
                const targetIdx = this.state.players.findIndex((p) => p.id === targetPlayerId);
                if (targetIdx === -1) {
                    throw new Error("Target player not found in room.");
                }
                this.state.players.splice(targetIdx, 1);
                this.state.players.forEach((p, idx) => {
                    p.seatIndex = idx;
                });
                this.kickedPlayerIds.add(targetPlayerId);
                try {
                    session_repository_1.SessionRepository.getInstance().setPlayerOffline(targetPlayerId);
                }
                catch {
                    // Ignore DB error on kick
                }
                this.removePlayerSockets(targetPlayerId, 4003, "You were removed from the room by the Host.", true);
                this.persistLobbyState();
                this.broadcastLobbyState();
                return currentToken;
            }
            case "START_GAME": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!playerId) {
                    throw new Error("Session not authenticated. Please sign in again.");
                }
                if (!this.state.roomExists) {
                    throw new Error("No active room exists.");
                }
                if (this.state.status !== "waiting") {
                    throw new Error("Game has already started.");
                }
                if (playerId !== this.state.hostId) {
                    throw new Error("Only the Host can start the game.");
                }
                const onlinePlayers = this.state.players.filter((p) => p.isOnline);
                if (onlinePlayers.length < this.state.minPlayers) {
                    throw new Error(`Minimum ${this.state.minPlayers} players required to start.`);
                }
                const notReady = onlinePlayers.filter((p) => !p.isHost && !p.isReady);
                if (notReady.length > 0) {
                    throw new Error("All players must be Ready.");
                }
                // Initialize and start GameEngine
                const startResult = game_handler_1.GameSessionManager.getInstance().startGame(this.state.roomId, onlinePlayers, this.state.settings, this);
                if (!startResult.success) {
                    throw new Error(startResult.message || "Failed to initialize GameEngine.");
                }
                this.state.status = "in_game";
                this.persistLobbyState();
                this.broadcastLobbyState();
                return currentToken;
            }
            case "RESET_LOBBY":
            case "RESET_ROOM":
            case "RETURN_TO_LOBBY": {
                const requesterId = this.resolvePlayerId(ws, currentToken);
                if (!requesterId) {
                    throw new Error("Session not authenticated.");
                }
                if (!this.state.roomExists) {
                    this.send(ws, "LOBBY_STATE", this.state);
                    return currentToken;
                }
                const activeEngine = game_handler_1.GameSessionManager.getInstance().getSession(this.state.roomId);
                if (this.state.status === "waiting" && !activeEngine) {
                    this.send(ws, "LOBBY_STATE", this.state);
                    return currentToken;
                }
                const isFinished = Boolean(activeEngine?.getState().gameOver);
                const isMember = this.state.players.some((p) => p.id === requesterId);
                if (requesterId !== this.state.hostId && !(isFinished && isMember)) {
                    throw new Error("Only the Host can reset an active match.");
                }
                game_handler_1.GameSessionManager.getInstance().endSession(this.state.roomId);
                this.kickedPlayerIds.clear();
                this.state.status = "waiting";
                this.state.players.forEach((p) => {
                    p.isReady = p.isHost;
                });
                this.persistLobbyState();
                this.broadcastLobbyState();
                return currentToken;
            }
            case "DELETE_MATCH":
            case "ABORT_MATCH": {
                const requesterId = this.resolvePlayerId(ws, currentToken);
                if (!requesterId) {
                    throw new Error("Session not authenticated.");
                }
                if (!this.state.roomExists) {
                    throw new Error("No active room exists.");
                }
                if (requesterId !== this.state.hostId) {
                    throw new Error("Only the Host can delete the current match.");
                }
                game_handler_1.GameSessionManager.getInstance().endSession(this.state.roomId);
                this.kickedPlayerIds.clear();
                this.state.status = "waiting";
                this.state.players.forEach((p) => {
                    p.isReady = p.isHost;
                });
                this.persistLobbyState();
                this.broadcastLobbyState();
                return currentToken;
            }
            case "DELETE_ROOM":
            case "CLOSE_ROOM": {
                const requesterId = this.resolvePlayerId(ws, currentToken);
                if (!requesterId) {
                    throw new Error("Session not authenticated.");
                }
                if (!this.state.roomExists) {
                    this.send(ws, "LOBBY_STATE", this.state);
                    return currentToken;
                }
                if (requesterId !== this.state.hostId) {
                    throw new Error("Only the Host can delete this room.");
                }
                this.resetRoomToEmptyState();
                this.broadcastLobbyState();
                return currentToken;
            }
            // In-game Action Commands
            case "GAME_COMMAND":
            case "SELECT_CHARACTERS":
            case "RESOLVE_TURN_START":
            case "RESOLVE_PHASE_1":
            case "PLAY_CARD":
            case "ACTIVATE_GREEN_CARD":
            case "DISCARD_CARD":
            case "RESOLVE_REACTION":
            case "END_TURN":
            case "USE_ACTIVE_SKILL":
            case "SELECT_STOLEN_CARD": {
                const playerId = this.resolvePlayerId(ws, currentToken);
                if (!playerId) {
                    this.send(ws, "ERROR", { code: "UNAUTHENTICATED_SESSION", message: "Unauthenticated session." });
                    return currentToken;
                }
                const rawPayload = msg.payload && typeof msg.payload === "object" ? msg.payload : {};
                const command = msg.type === "GAME_COMMAND"
                    ? { ...rawPayload, playerId }
                    : {
                        ...rawPayload,
                        playerId,
                        type: msg.type,
                    };
                game_handler_1.GameSessionManager.getInstance().handlePlayerCommand(playerId, command, this.state.roomId, ws, this);
                return currentToken;
            }
            case "SYNC_LOBBY": {
                if (!this.resolvePlayerId(ws, currentToken)) {
                    this.send(ws, "AUTH_REQUIRED", {
                        reason: "Session expired or invalid. Please sign in again.",
                    });
                    return currentToken;
                }
                this.send(ws, "LOBBY_STATE", this.state);
                return currentToken;
            }
            case "PING": {
                this.send(ws, "PONG", { timestamp: Date.now() });
                return currentToken;
            }
            default:
                return currentToken;
        }
    }
    removePlayerSockets(playerId, closeCode, reason, notifyKicked) {
        this.clearDisconnectTimer(playerId);
        const socketsToClose = this.collectPlayerSockets(playerId);
        for (const [tok, pId] of Array.from(this.tokenToPlayerId.entries())) {
            if (pId === playerId) {
                this.connections.delete(tok);
                this.tokenToPlayerId.delete(tok);
            }
        }
        for (const targetWs of socketsToClose) {
            if (notifyKicked) {
                this.send(targetWs, "PLAYER_KICKED", {
                    playerId,
                    reason,
                });
            }
            this.unbindSocket(targetWs);
            if (targetWs.readyState === ws_1.WebSocket.OPEN || targetWs.readyState === ws_1.WebSocket.CONNECTING) {
                try {
                    targetWs.close(closeCode, reason);
                }
                catch {
                    targetWs.terminate();
                }
            }
        }
        this.playerSockets.delete(playerId);
    }
    // Revoke and close all active player sockets
    disconnectPlayerSockets(playerId, reason) {
        this.removePlayerSockets(playerId, 4001, reason || "Session ended.", false);
        const player = this.state.players.find((p) => p.id === playerId);
        if (player) {
            player.isOnline = false;
            player.isReady = player.isHost;
            try {
                this.persistLobbyState();
            }
            catch {
                // Ignore DB error during disconnect
            }
            this.broadcastLobbyState();
            const gameManager = game_handler_1.GameSessionManager.getInstance();
            const activeEngine = gameManager.getSession(this.state.roomId);
            if (activeEngine) {
                gameManager.broadcastGameSnapshot(this.state.roomId, activeEngine, this);
            }
        }
    }
    addOrRestorePlayer(playerId, name) {
        let player = this.state.players.find((p) => p.id === playerId);
        if (player) {
            player.isOnline = true;
            player.name = name;
            if (playerId === this.state.hostId) {
                player.isHost = true;
                player.isReady = true;
            }
        }
        else {
            if (this.state.players.length >= this.state.maxPlayers) {
                throw new Error("Room is full (max 8 players).");
            }
            const isHost = playerId === this.state.hostId;
            player = {
                id: playerId,
                name,
                seatIndex: this.state.players.length,
                isHost,
                isReady: isHost,
                isOnline: true,
            };
            this.state.players.push(player);
        }
    }
    handleDisconnect(ws) {
        const { playerId } = this.unbindSocket(ws);
        if (!playerId)
            return;
        // Keep player online while another active socket exists
        if (this.hasOpenSocket(playerId)) {
            return;
        }
        this.clearDisconnectTimer(playerId);
        const timer = setTimeout(() => {
            this.disconnectTimers.delete(playerId);
            if (this.hasOpenSocket(playerId)) {
                return;
            }
            try {
                session_repository_1.SessionRepository.getInstance().setPlayerOffline(playerId);
            }
            catch {
                // Ignore DB failure on disconnect
            }
            const player = this.state.players.find((p) => p.id === playerId);
            if (player) {
                player.isOnline = false;
                player.isReady = player.isHost;
                // Preserve original host across disconnects
                try {
                    this.persistLobbyState();
                }
                catch {
                    // Ignore DB failure on disconnect
                }
                this.broadcastLobbyState();
                // Sync active table state for disconnect indicator
                const gameManager = game_handler_1.GameSessionManager.getInstance();
                const activeEngine = gameManager.getSession(this.state.roomId);
                if (activeEngine) {
                    gameManager.broadcastGameSnapshot(this.state.roomId, activeEngine, this);
                }
            }
        }, 1000);
        timer.unref?.();
        this.disconnectTimers.set(playerId, timer);
    }
    isPlayerOnline(playerId) {
        const player = this.state.players.find((p) => p.id === playerId);
        return player ? player.isOnline : false;
    }
    persistLobbyState() {
        const repo = session_repository_1.SessionRepository.getInstance();
        if (!this.state.roomExists) {
            repo.deleteRoomState(this.state.roomId);
            return;
        }
        repo.saveRoomState(this.state.roomId, this.state.hostId, this.state.status, {
            ...this.state.settings,
            _roomMeta: {
                roomName: this.state.roomName || "Saloon Table #1",
                players: this.state.players.map((p) => ({
                    id: p.id,
                    name: p.name,
                    seatIndex: p.seatIndex,
                    isHost: p.isHost,
                })),
            },
        });
    }
    // Restore room and active match state
    restoreFromPersistence() {
        try {
            const repo = session_repository_1.SessionRepository.getInstance();
            const row = repo.getRoomState(this.state.roomId);
            if (!row)
                return;
            const parsed = JSON.parse(row.settings_json || "{}");
            const meta = parsed._roomMeta;
            const savedPlayers = Array.isArray(meta?.players) ? meta.players : [];
            if (savedPlayers.length === 0 || !row.host_id) {
                repo.deleteRoomState(this.state.roomId);
                return;
            }
            this.state.roomExists = true;
            this.state.hostId = row.host_id;
            this.state.roomName =
                typeof meta?.roomName === "string" && meta.roomName.trim()
                    ? meta.roomName.trim().slice(0, 32)
                    : "Saloon Table #1";
            this.state.settings = {
                dualCharacterEnabled: Boolean(parsed.dualCharacterEnabled),
                dualCharacterHpRule: ["strict", "balanced", "juggernaut"].includes(parsed.dualCharacterHpRule)
                    ? parsed.dualCharacterHpRule
                    : "strict",
                expansions: Array.isArray(parsed.expansions)
                    ? (0, expansion_config_1.filterActiveExpansions)(parsed.expansions.map((e) => String(e)))
                    : ["base", "dodge_city"],
            };
            this.state.players = savedPlayers.map((p, idx) => {
                const playerId = String(p.id);
                const isHost = playerId === row.host_id || Boolean(p.isHost);
                const name = typeof p.name === "string" ? p.name : `Player_${idx + 1}`;
                this.playerNames.set(playerId, name);
                return {
                    id: playerId,
                    name,
                    seatIndex: typeof p.seatIndex === "number" ? p.seatIndex : idx,
                    isHost,
                    isReady: isHost,
                    isOnline: this.hasOpenSocket(playerId),
                };
            });
            if (row.status === "in_game") {
                const restoredEngine = game_handler_1.GameSessionManager.getInstance().restoreSessionFromDb(this.state.roomId);
                if (restoredEngine) {
                    this.state.status = "in_game";
                }
                else {
                    this.state.status = "waiting";
                    this.persistLobbyState();
                }
            }
            else {
                this.state.status = "waiting";
            }
            this.broadcastLobbyState();
        }
        catch {
            // Ignore corrupt persisted room state
        }
    }
    broadcastLobbyState() {
        this.broadcastMessage("LOBBY_STATE", this.state);
    }
    sendSerialized(recipients, str) {
        for (const ws of recipients) {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                try {
                    ws.send(str);
                }
                catch {
                    // Ignore send failure on closing socket
                }
            }
        }
    }
    broadcastMessage(type, payload) {
        const str = JSON.stringify({ type, payload });
        const recipients = new Set();
        for (const set of this.playerSockets.values()) {
            for (const ws of set) {
                recipients.add(ws);
            }
        }
        for (const ws of this.connections.values()) {
            recipients.add(ws);
        }
        this.sendSerialized(recipients, str);
    }
    sendToPlayer(playerId, type, payload) {
        const str = JSON.stringify({ type, payload });
        this.sendSerialized(this.collectPlayerSockets(playerId), str);
    }
    // Send one serialized message to multiple players
    sendToPlayers(playerIds, type, payload) {
        const str = JSON.stringify({ type, payload });
        const recipients = new Set();
        for (const playerId of playerIds) {
            for (const ws of this.collectPlayerSockets(playerId)) {
                recipients.add(ws);
            }
        }
        this.sendSerialized(recipients, str);
    }
    getConnectedPlayerIds() {
        return Array.from(new Set(this.tokenToPlayerId.values()));
    }
    getPlayerIdByToken(token) {
        return this.tokenToPlayerId.get(token);
    }
    send(ws, type, payload) {
        (0, ws_utils_1.sendSocketJson)(ws, String(type), payload);
    }
}
exports.LobbyManager = LobbyManager;
