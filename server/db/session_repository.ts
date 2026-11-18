import crypto from "crypto";
import { promisify } from "util";
import type Database from "better-sqlite3";
import { CONFIG } from "../config";
import { getRuntimeDatabase } from "./database";
import { PlayerSessionRow, ActiveRoomRow, MatchEventRow } from "./schema";

const scryptAsync = promisify(crypto.scrypt);
const runtimeFallbackSecret = crypto.randomBytes(32).toString("hex");

function getSessionHmacSecret(): string {
  return CONFIG.SESSION_HMAC_SECRET || runtimeFallbackSecret;
}

function hashSessionToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", getSessionHmacSecret())
    .update(rawToken)
    .digest("hex");
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { code?: string; message?: string };
  return (
    record.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    record.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    String(record.message || "").includes("UNIQUE constraint failed")
  );
}

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

interface CachedStatements {
  selectByToken: Database.Statement;
  selectByName: Database.Statement;
  selectById: Database.Statement;
  updateSessionOnlineByToken: Database.Statement;
  updateSessionTokenById: Database.Statement;
  insertSession: Database.Statement;
  upsertGameState: Database.Statement;
  insertMatchEvent: Database.Statement;
  selectRecentMatchEvents: Database.Statement;
}

export class SessionRepository {
  private static instance: SessionRepository;
  private cachedDb: Database.Database | null = null;
  private stmts: CachedStatements | null = null;

  public static getInstance(): SessionRepository {
    if (!SessionRepository.instance) {
      SessionRepository.instance = new SessionRepository();
    }
    return SessionRepository.instance;
  }

  private getStatements(db: Database.Database): CachedStatements {
    if (this.cachedDb === db && this.stmts) {
      return this.stmts;
    }

    this.cachedDb = db;
    this.stmts = {
      selectByToken: db.prepare("SELECT * FROM player_sessions WHERE session_token = ?"),
      selectByName: db.prepare("SELECT * FROM player_sessions WHERE player_name = ?"),
      selectById: db.prepare("SELECT * FROM player_sessions WHERE player_id = ?"),
      updateSessionOnlineByToken: db.prepare(
        "UPDATE player_sessions SET is_online = 1, last_seen = ?, ip_address = ? WHERE player_id = ? AND session_token = ?"
      ),
      updateSessionTokenById: db.prepare(
        "UPDATE player_sessions SET session_token = ?, is_online = 1, last_seen = ?, ip_address = ? WHERE player_id = ?"
      ),
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
      selectRecentMatchEvents: db.prepare(
        "SELECT * FROM match_events WHERE match_id = ? ORDER BY seq DESC LIMIT ?"
      ),
    };
    return this.stmts;
  }

  private async verifyAndRotateExisting(
    stmts: CachedStatements,
    existing: PlayerSessionRow,
    pin: string,
    ip?: string
  ): Promise<AuthenticatedSession> {
    const isMatch = await verifyPinAsync(pin, existing.pin_hash, existing.pin_salt);
    if (!isMatch) {
      throw new Error(
        "Player name already exists. Please enter the correct PIN or choose a different name."
      );
    }

    const newToken = crypto.randomUUID();
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
  public async authenticatePlayer(
    name: string,
    pin: string,
    token?: string,
    ip?: string
  ): Promise<AuthenticatedSession> {
    const db = getRuntimeDatabase();
    const stmts = this.getStatements(db);

    if (token) {
      const tokenHash = hashSessionToken(token);
      const row = stmts.selectByToken.get(tokenHash) as PlayerSessionRow | undefined;

      if (row && row.player_name === name) {
        const isMatch = await verifyPinAsync(pin, row.pin_hash, row.pin_salt);
        if (!isMatch) {
          throw new Error("Invalid PIN.");
        }
        const updateRes = stmts.updateSessionOnlineByToken.run(
          new Date().toISOString(),
          ip || null,
          row.player_id,
          tokenHash
        );
        if (updateRes.changes > 0) {
          return {
            sessionToken: token,
            playerId: row.player_id,
            name: row.player_name,
          };
        }
      }
    }

    const existingByName = stmts.selectByName.get(name) as PlayerSessionRow | undefined;
    if (existingByName) {
      return this.verifyAndRotateExisting(stmts, existingByName, pin, ip);
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const pinHash = await hashPinAsync(pin, salt);
    const newToken = crypto.randomUUID();
    const newTokenHash = hashSessionToken(newToken);
    const playerId = `p_${crypto.randomBytes(6).toString("hex")}`;
    const now = new Date().toISOString();

    const insertTxn = db.transaction((): PlayerSessionRow | null => {
      const racedRow = stmts.selectByName.get(name) as PlayerSessionRow | undefined;
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
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const racedExisting = stmts.selectByName.get(name) as PlayerSessionRow | undefined;
        if (racedExisting) {
          return this.verifyAndRotateExisting(stmts, racedExisting, pin, ip);
        }
      }
      throw err;
    }
  }

  public setPlayerOffline(playerId: string): void {
    const db = getRuntimeDatabase();
    const now = new Date().toISOString();
    db.prepare("UPDATE player_sessions SET is_online = 0, last_seen = ? WHERE player_id = ?").run(
      now,
      playerId
    );
  }

  // Rotate token hash and mark player offline
  public invalidateSession(playerId: string): void {
    const db = getRuntimeDatabase();
    const now = new Date().toISOString();
    const revokedHash = hashSessionToken(
      `revoked:${crypto.randomUUID()}:${crypto.randomBytes(16).toString("hex")}`
    );
    db.prepare(
      "UPDATE player_sessions SET session_token = ?, is_online = 0, last_seen = ? WHERE player_id = ?"
    ).run(revokedHash, now, playerId);
  }

  public getPlayerByToken(sessionToken: string): PlayerSessionRow | undefined {
    if (!sessionToken || typeof sessionToken !== "string") return undefined;
    const db = getRuntimeDatabase();
    const tokenHash = hashSessionToken(sessionToken);
    return this.getStatements(db).selectByToken.get(tokenHash) as PlayerSessionRow | undefined;
  }

  public getPlayerById(playerId: string): PlayerSessionRow | undefined {
    const db = getRuntimeDatabase();
    return this.getStatements(db).selectById.get(playerId) as PlayerSessionRow | undefined;
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
    this.getStatements(db).upsertGameState.run(matchId, JSON.stringify(state), now);
  }

  // Persist match state and tick events atomically
  public saveMatchTick(
    matchId: string,
    state: any,
    events: Array<{ seq: number; eventType: string; payload: any }>
  ): void {
    const db = getRuntimeDatabase();
    const stmts = this.getStatements(db);
    const now = new Date().toISOString();
    const stateJson = JSON.stringify(state);

    const runTick = db.transaction(() => {
      stmts.upsertGameState.run(matchId, stateJson, now);
      for (const ev of events) {
        stmts.insertMatchEvent.run(
          matchId,
          ev.seq,
          ev.eventType,
          JSON.stringify(ev.payload ?? {}),
          now
        );
      }
    });
    runTick();
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
    this.getStatements(db).insertMatchEvent.run(
      matchId,
      seq,
      eventType,
      JSON.stringify(payload),
      now
    );
  }

  public getMatchEvents(matchId: string): MatchEventRow[] {
    const db = getRuntimeDatabase();
    return db
      .prepare("SELECT * FROM match_events WHERE match_id = ? ORDER BY seq ASC")
      .all(matchId) as MatchEventRow[];
  }

  // Load latest match events in chronological order
  public getRecentMatchEvents(matchId: string, limit = 100): MatchEventRow[] {
    const db = getRuntimeDatabase();
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    const rows = this.getStatements(db).selectRecentMatchEvents.all(
      matchId,
      safeLimit
    ) as MatchEventRow[];
    return rows.reverse();
  }

  public deleteMatchEvents(matchId: string): void {
    const db = getRuntimeDatabase();
    db.prepare("DELETE FROM match_events WHERE match_id = ?").run(matchId);
  }
}
