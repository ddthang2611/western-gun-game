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
const database_1 = require("./database");
const scryptAsync = (0, util_1.promisify)(crypto_1.default.scrypt);
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
    static getInstance() {
        if (!SessionRepository.instance) {
            SessionRepository.instance = new SessionRepository();
        }
        return SessionRepository.instance;
    }
    // Asynchronous authentication running on Libuv threadpool to prevent Event Loop DoS (VULN-03)
    async authenticatePlayer(name, pin, token, ip) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        if (token) {
            const row = db
                .prepare("SELECT * FROM player_sessions WHERE session_token = ?")
                .get(token);
            if (row) {
                const isMatch = await verifyPinAsync(pin, row.pin_hash, row.pin_salt);
                if (!isMatch) {
                    throw new Error("Invalid PIN.");
                }
                db.prepare("UPDATE player_sessions SET is_online = 1, last_seen = ?, ip_address = ? WHERE session_token = ?").run(now, ip || null, token);
                return {
                    sessionToken: token,
                    playerId: row.player_id,
                    name: row.player_name,
                };
            }
        }
        const existingByName = db
            .prepare("SELECT * FROM player_sessions WHERE player_name = ?")
            .get(name);
        if (existingByName) {
            const isMatch = await verifyPinAsync(pin, existingByName.pin_hash, existingByName.pin_salt);
            if (!isMatch) {
                throw new Error("Player name already exists. Please enter the correct PIN or choose a different name.");
            }
            const newToken = crypto_1.default.randomUUID();
            db.prepare(`
        UPDATE player_sessions
        SET session_token = ?, is_online = 1, last_seen = ?, ip_address = ?
        WHERE player_id = ?
      `).run(newToken, now, ip || null, existingByName.player_id);
            return {
                sessionToken: newToken,
                playerId: existingByName.player_id,
                name,
            };
        }
        const salt = crypto_1.default.randomBytes(16).toString("hex");
        const pinHash = await hashPinAsync(pin, salt);
        const newToken = crypto_1.default.randomUUID();
        const playerId = `p_${crypto_1.default.randomBytes(4).toString("hex")}`;
        db.prepare(`
      INSERT INTO player_sessions (session_token, player_id, player_name, pin_hash, pin_salt, ip_address, is_online, last_seen, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(newToken, playerId, name, pinHash, salt, ip || null, now, now);
        return {
            sessionToken: newToken,
            playerId,
            name,
        };
    }
    setPlayerOffline(playerId) {
        const db = (0, database_1.getRuntimeDatabase)();
        const now = new Date().toISOString();
        db.prepare("UPDATE player_sessions SET is_online = 0, last_seen = ? WHERE player_id = ?").run(now, playerId);
    }
    getPlayerByToken(sessionToken) {
        const db = (0, database_1.getRuntimeDatabase)();
        return db
            .prepare("SELECT * FROM player_sessions WHERE session_token = ?")
            .get(sessionToken);
    }
    getPlayerById(playerId) {
        const db = (0, database_1.getRuntimeDatabase)();
        return db
            .prepare("SELECT * FROM player_sessions WHERE player_id = ?")
            .get(playerId);
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
        db.prepare(`
      INSERT INTO active_session (match_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(matchId, JSON.stringify(state), now);
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
        db.prepare(`
      INSERT INTO match_events (match_id, seq, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(matchId, seq, eventType, JSON.stringify(payload), now);
    }
    getMatchEvents(matchId) {
        const db = (0, database_1.getRuntimeDatabase)();
        return db
            .prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY seq ASC")
            .all(matchId);
    }
    deleteMatchEvents(matchId) {
        const db = (0, database_1.getRuntimeDatabase)();
        db.prepare("DELETE FROM match_events WHERE match_id = ?").run(matchId);
    }
}
exports.SessionRepository = SessionRepository;
