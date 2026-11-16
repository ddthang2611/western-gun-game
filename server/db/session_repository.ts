import crypto from "crypto";
import { promisify } from "util";
import { getRuntimeDatabase } from "./database";
import { PlayerSessionRow, ActiveRoomRow, MatchEventRow, ActiveSessionRow } from "./schema";

const scryptAsync = promisify(crypto.scrypt);

export interface AuthenticatedSession {
  sessionToken: string;
  playerId: string;
  name: string;
}

export function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}

export async function hashPinAsync(pin: string, salt: string): Promise<string> {
  const buf = (await scryptAsync(pin, salt, 32)) as Buffer;
  return buf.toString("hex");
}

export function verifyPin(pin: string, storedHash: string, salt: string): boolean {
  const computed = crypto.scryptSync(pin, salt, 32);
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

export async function verifyPinAsync(pin: string, storedHash: string, salt: string): Promise<boolean> {
  const computed = (await scryptAsync(pin, salt, 32)) as Buffer;
  const stored = Buffer.from(storedHash, "hex");
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

export class SessionRepository {
  private static instance: SessionRepository;

  public static getInstance(): SessionRepository {
    if (!SessionRepository.instance) {
      SessionRepository.instance = new SessionRepository();
    }
    return SessionRepository.instance;
  }

  // Asynchronous authentication running on Libuv threadpool to prevent Event Loop DoS (VULN-03)
  public async authenticatePlayer(
    name: string,
    pin: string,
    token?: string,
    ip?: string
  ): Promise<AuthenticatedSession> {
    const db = getRuntimeDatabase();
    const now = new Date().toISOString();

    if (token) {
      const row = db
        .prepare("SELECT * FROM player_sessions WHERE session_token = ?")
        .get(token) as PlayerSessionRow | undefined;

      if (row) {
        const isMatch = await verifyPinAsync(pin, row.pin_hash, row.pin_salt);
        if (!isMatch) {
          throw new Error("Invalid PIN.");
        }
        db.prepare(
          "UPDATE player_sessions SET is_online = 1, last_seen = ?, ip_address = ? WHERE session_token = ?"
        ).run(now, ip || null, token);

        return {
          sessionToken: token,
          playerId: row.player_id,
          name: row.player_name,
        };
      }
    }

    const existingByName = db
      .prepare("SELECT * FROM player_sessions WHERE player_name = ?")
      .get(name) as PlayerSessionRow | undefined;

    if (existingByName) {
      const isMatch = await verifyPinAsync(pin, existingByName.pin_hash, existingByName.pin_salt);
      if (!isMatch) {
        throw new Error("Player name already exists. Please enter the correct PIN or choose a different name.");
      }

      const newToken = crypto.randomUUID();
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

    const salt = crypto.randomBytes(16).toString("hex");
    const pinHash = await hashPinAsync(pin, salt);
    const newToken = crypto.randomUUID();
    const playerId = `p_${crypto.randomBytes(4).toString("hex")}`;

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

  public setPlayerOffline(playerId: string): void {
    const db = getRuntimeDatabase();
    const now = new Date().toISOString();
    db.prepare("UPDATE player_sessions SET is_online = 0, last_seen = ? WHERE player_id = ?").run(
      now,
      playerId
    );
  }

  public getPlayerByToken(sessionToken: string): PlayerSessionRow | undefined {
    const db = getRuntimeDatabase();
    return db
      .prepare("SELECT * FROM player_sessions WHERE session_token = ?")
      .get(sessionToken) as PlayerSessionRow | undefined;
  }

  public getPlayerById(playerId: string): PlayerSessionRow | undefined {
    const db = getRuntimeDatabase();
    return db
      .prepare("SELECT * FROM player_sessions WHERE player_id = ?")
      .get(playerId) as PlayerSessionRow | undefined;
  }

  public saveRoomState(roomId: string, hostId: string, status: string, settings: any): void {
    const db = getRuntimeDatabase();
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

  public getRoomState(roomId: string): ActiveRoomRow | undefined {
    const db = getRuntimeDatabase();
    return db.prepare("SELECT * FROM active_rooms WHERE room_id = ?").get(roomId) as
      | ActiveRoomRow
      | undefined;
  }

  public deleteRoomState(roomId: string): void {
    const db = getRuntimeDatabase();
    db.prepare("DELETE FROM active_rooms WHERE room_id = ?").run(roomId);
  }

  public saveGameState(matchId: string, state: any): void {
    const db = getRuntimeDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO active_session (match_id, state_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(matchId, JSON.stringify(state), now);
  }

  public getGameState(matchId: string): any | null {
    const db = getRuntimeDatabase();
    const row = db.prepare("SELECT state_json FROM active_session WHERE match_id = ?").get(matchId) as
      | { state_json: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.state_json);
    } catch {
      return null;
    }
  }

  public deleteGameState(matchId: string): void {
    const db = getRuntimeDatabase();
    db.prepare("DELETE FROM active_session WHERE match_id = ?").run(matchId);
  }

  public logMatchEvent(matchId: string, seq: number, eventType: string, payload: any): void {
    const db = getRuntimeDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO match_events (match_id, seq, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(matchId, seq, eventType, JSON.stringify(payload), now);
  }

  public getMatchEvents(matchId: string): MatchEventRow[] {
    const db = getRuntimeDatabase();
    return db
      .prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY seq ASC")
      .all(matchId) as MatchEventRow[];
  }

  public deleteMatchEvents(matchId: string): void {
    const db = getRuntimeDatabase();
    db.prepare("DELETE FROM match_events WHERE match_id = ?").run(matchId);
  }
}
