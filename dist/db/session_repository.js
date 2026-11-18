"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRepository = void 0;
exports.hashPin = hashPin;
exports.hashPinAsync = hashPinAsync;
exports.verifyPin = verifyPin;
exports.verifyPinAsync = verifyPinAsync;
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("util");
const config_1 = require("../config");
const database_1 = require("./database");
const scryptAsync = (0, util_1.promisify)(crypto_1.default.scrypt);
const runtimeFallbackSecret = crypto_1.default.randomBytes(32).toString("hex");
function getSessionHmacSecret() {
    return config_1.CONFIG.SESSION_HMAC_SECRET || runtimeFallbackSecret;
}
function hashSessionToken(rawToken) {
    return crypto_1.default
        .createHmac("sha256", getSessionHmacSecret())
        .update(rawToken)
        .digest("hex");
}
function isUniqueConstraintError(err) {
    if (!err || typeof err !== "object")
        return false;
    const record = err;
    return (record.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        record.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
        String(record.message || "").includes("UNIQUE constraint failed"));
}
function hashPin(pin, salt) {
    return crypto_1.default.scryptSync(pin, salt, 32).toString("hex");
}
async function hashPinAsync(pin, salt) {
    const buf = (await scryptAsync(pin, salt, 32));
    return buf.toString("hex");
}
function verifyPin(pin, storedHash, salt) {
    const computed = crypto_1.default.scryptSync(pin, salt, 32);
    const stored = Buffer.from(storedHash, "hex");
    if (computed.length !== stored.length)
        return false;
    return crypto_1.default.timingSafeEqual(computed, stored);
}
async function verifyPinAsync(pin, storedHash, salt) {
    const computed = (await scryptAsync(pin, salt, 32));
    const stored = Buffer.from(storedHash, "hex");
    if (computed.length !== stored.length)
        return false;
    return crypto_1.default.timingSafeEqual(computed, stored);
}
class SessionRepository {
    static instance;
    cachedDb = null;
    stmts = null;
    static getInstance() {
        if (!SessionRepository.instance) {
            SessionRepository.instance = new SessionRepository();
        }
        return SessionRepository.instance;
    }
    getStatements(db) {
        if (this.cachedDb === db && this.stmts) {
            return this.stmts;
        }
        this.cachedDb = db;
        this.stmts = {
            selectByToken: db.prepare("SELECT * FROM player_sessions WHERE session_token = ?"),
            selectByName: db.prepare("SELECT * FROM player_sessions WHERE player_name = ?"),
            selectById: db.prepare("SELECT * FROM player_sessions WHERE player_id = ?"),
            updateSessionOnlineByToken: db.prepare("UPDATE player_sessions SET is_online = 1, last_seen = ?, ip_address = ? WHERE player_id = ? AND session_token = ?"),
            updateSessionTokenById: db.prepare("UPDATE player_sessions SET session_token = ?, is_online = 1, last_seen = ?, ip_address = ? WHERE player_id = ?"),
            insertSession: db.prepare(`
        INSERT INTO player_sessions (session_token, player_id, player_name, pin_hash, pin_salt, ip_address, is_online, last_seen, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `),
            upsertGameState: db.prepare(`
        INSERT INTO active_session (match_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(match_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `),
            insertMatchEvent: db.prepare(`
        INSERT INTO match_events (match_id, seq, event_type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `),
            selectRecentMatchEvents: db.prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY seq DESC LIMIT ?"),
        };
        return this.stmts;
    }
    async verifyAndRotateExisting(stmts, existing, pin, ip) {
        const isMatch = await verifyPinAsync(pin, existing.pin_hash, existing.pin_salt);
        if (!isMatch) {
            throw new Error("Player name already exists. Please enter the correct PIN or choose a different name.");
        }
        const newToken = crypto_1.default.randomUUID();
        const newTokenHash = hashSessionToken(newToken);
        const now = new Date().toISOString();
        stmts.updateSessionTokenById.run(newTokenHash, now, ip || null, existing.player_id);
        return {
            sessionToken: newToken,
            playerId: existing.player_id,
            name: existing.player_name,
        };
    }
    // Asynchronous authentication running on Libuv threadpool to prevent Event Loop DoS (VULN-03)
    async authenticatePlayer(name, pin, token, ip) {
        const db = (0, database_1.getRuntimeDatabase)();
        const stmts = this.getStatements(db);
        if (token) {
            const tokenHash = hashSessionToken(token);
            const row = stmts.selectByToken.get(tokenHash);
            if (row && row.player_name === name) {
                const isMatch = await verifyPinAsync(pin, row.pin_hash, row.pin_salt);
                if (!isMatch) {
                    throw new Error("Invalid PIN.");
                }
                const updateRes = stmts.updateSessionOnlineByToken.run(new Date().toISOString(), ip || null, row.player_id, tokenHash);
                if (updateRes.changes > 0) {
                    return {
                        sessionToken: token,
                        playerId: row.player_id,
                        name: row.player_name,
                    };
                }
            }
        }
        const existingByName = stmts.selectByName.get(name);
        if (existingByName) {
            return this.verifyAndRotateExisting(stmts, existingByName, pin, ip);
        }
        const salt = crypto_1.default.randomBytes(16).toString("hex");
        const pinHash = await hashPinAsync(pin, salt);
        const newToken = crypto_1.default.randomUUID();
        const newTokenHash = hashSessionToken(newToken);
        const playerId = `p_${crypto_1.default.randomBytes(6).toString("hex")}`;
        const now = new Date().toISOString();
        const insertTxn = db.transaction(() => {
            const racedRow = stmts.selectByName.get(name);
            if (racedRow) {
                return racedRow;
            }
            stmts.insertSession.run(newTokenHash, playerId, name, pinHash, salt, ip || null, now, now);
            return null;
        });
        try {
            const racedRow = insertTxn();
            if (racedRow) {
                return this.verifyAndRotateExisting(stmts, racedRow, pin, ip);
            }
            return {
                sessionToken: newToken,
                playerId,
                name,
            };
        }
        catch (err) {
            if (isUniqueConstraintError(err)) {
                const racedExisting = stmts.selectByName.get(name);
                if (racedExisting) {
                    return this.verifyAndRotateExisting(stmts, racedExisting, pin, ip);
                }
            }
            throw err;
        }
    }
    setPlayerOffline(playerId) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        db.prepare("UPDATE player_sessions SET is_online = 0, last_seen = ? WHERE player_id = ?").run(now, playerId);
    }
    // Rotate token hash and mark player offline
    invalidateSession(playerId) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        const revokedHash = hashSessionToken(`revoked:${crypto_1.default.randomUUID()}:${crypto_1.default.randomBytes(16).toString("hex")}`);
        db.prepare("UPDATE player_sessions SET session_token = ?, is_online = 0, last_seen = ? WHERE player_id = ?").run(revokedHash, now, playerId);
    }
    getPlayerByToken(sessionToken) {
        if (!sessionToken || typeof sessionToken !== "string")
            return undefined;
        const db = (0, database_1.getRuntimeDatabase)();
        const tokenHash = hashSessionToken(sessionToken);
        return this.getStatements(db).selectByToken.get(tokenHash);
    }
    getPlayerById(playerId) {
        const db = (0, database_1.getRuntimeDatabase)();
        return this.getStatements(db).selectById.get(playerId);
    }
    saveRoomState(roomId, hostId, status, settings) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO active_rooms (room_id, host_id, status, settings_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET
        host_id = excluded.host_id,
        status = excluded.status,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `).run(roomId, hostId, status, JSON.stringify(settings), now);
    }
    getRoomState(roomId) {
        const db = (0, database_1.getRuntimeDatabase)();
        return db.prepare("SELECT * FROM active_rooms WHERE room_id = ?").get(roomId);
    }
    deleteRoomState(roomId) {
        const db = (0, database_1.getRuntimeDatabase)();
        db.prepare("DELETE FROM active_rooms WHERE room_id = ?").run(roomId);
    }
    saveGameState(matchId, state) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        this.getStatements(db).upsertGameState.run(matchId, JSON.stringify(state), now);
    }
    // Persist match state and tick events atomically
    saveMatchTick(matchId, state, events) {
        const db = (0, database_1.getRuntimeDatabase)();
        const stmts = this.getStatements(db);
        const now = new Date().toISOString();
        const stateJson = JSON.stringify(state);
        const runTick = db.transaction(() => {
            stmts.upsertGameState.run(matchId, stateJson, now);
            for (const ev of events) {
                stmts.insertMatchEvent.run(matchId, ev.seq, ev.eventType, JSON.stringify(ev.payload ?? {}), now);
            }
        });
        runTick();
    }
    getGameState(matchId) {
        const db = (0, database_1.getRuntimeDatabase)();
        const row = db.prepare("SELECT state_json FROM active_session WHERE match_id = ?").get(matchId);
        if (!row)
            return null;
        try {
            return JSON.parse(row.state_json);
        }
        catch {
            return null;
        }
    }
    deleteGameState(matchId) {
        const db = (0, database_1.getRuntimeDatabase)();
        db.prepare("DELETE FROM active_session WHERE match_id = ?").run(matchId);
    }
    logMatchEvent(matchId, seq, eventType, payload) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        this.getStatements(db).insertMatchEvent.run(matchId, seq, eventType, JSON.stringify(payload), now);
    }
    getMatchEvents(matchId) {
        const db = (0, database_1.getRuntimeDatabase)();
        return db
            .prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY seq ASC")
            .all(matchId);
    }
    // Load latest match events in chronological order
    getRecentMatchEvents(matchId, limit = 100) {
        const db = (0, database_1.getRuntimeDatabase)();
        const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
        const rows = this.getStatements(db).selectRecentMatchEvents.all(matchId, safeLimit);
        return rows.reverse();
    }
    deleteMatchEvents(matchId) {
        const db = (0, database_1.getRuntimeDatabase)();
        db.prepare("DELETE FROM match_events WHERE match_id = ?").run(matchId);
    }
}
exports.SessionRepository = SessionRepository;
