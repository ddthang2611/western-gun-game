import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { CONFIG } from "../config";
import { CatalogRepository } from "./catalog_repository";

const scryptAsync = promisify(crypto.scrypt);

let catalogDbInstance: Database.Database | null = null;
let runtimeDbInstance: Database.Database | null = null;
let isCatalogUnlocked = false;

export function isDatabaseUnlocked(): boolean {
  return isCatalogUnlocked;
}

// Asynchronous unlock running on Libuv threadpool to prevent Event Loop starvation (VULN-03)
export async function unlockCatalogDatabaseAsync(
  secretKey: string
): Promise<{ success: boolean; message: string }> {
  if (!fs.existsSync(CONFIG.DB_PATH)) {
    return { success: false, message: `Catalog database file not found at: ${CONFIG.DB_PATH}` };
  }

  try {
    const inspectDb = new Database(CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
    const row = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_scrypt_hash'").get() as
      | { value: string }
      | undefined;
    const saltRow = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_salt'").get() as
      | { value: string }
      | undefined;
    inspectDb.close();

    if (!row || !saltRow) {
      return { success: false, message: "Database metadata missing security keys." };
    }

    const salt = saltRow.value;
    const storedHash = row.value;

    const computedBuf = (await scryptAsync(secretKey, salt, 32)) as Buffer;
    const expectedBuf = Buffer.from(storedHash, "hex");

    const isMatch =
      computedBuf.length === expectedBuf.length && crypto.timingSafeEqual(computedBuf, expectedBuf);

    if (isMatch) {
      if (!isCatalogUnlocked || !catalogDbInstance) {
        catalogDbInstance = new Database(CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
        isCatalogUnlocked = true;
        CatalogRepository.getInstance().initialize();
      }
      return { success: true, message: "Database unlocked successfully." };
    }

    // Factory key auto-migration removed to prevent unauthorized override (VULN-01)
    return { success: false, message: "Invalid DB_SECRET_KEY. Access to western_gun.db denied." };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to unlock catalog database." };
  }
}

// Synchronous unlock for initial server startup and CLI prompt
export function unlockCatalogDatabase(
  secretKey: string
): { success: boolean; message: string } {
  if (!fs.existsSync(CONFIG.DB_PATH)) {
    return { success: false, message: `Catalog database file not found at: ${CONFIG.DB_PATH}` };
  }

  try {
    const inspectDb = new Database(CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
    const row = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_scrypt_hash'").get() as
      | { value: string }
      | undefined;
    const saltRow = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_salt'").get() as
      | { value: string }
      | undefined;
    inspectDb.close();

    if (!row || !saltRow) {
      return { success: false, message: "Database metadata missing security keys." };
    }

    const salt = saltRow.value;
    const storedHash = row.value;

    const computedBuf = crypto.scryptSync(secretKey, salt, 32);
    const expectedBuf = Buffer.from(storedHash, "hex");

    const isMatch =
      computedBuf.length === expectedBuf.length && crypto.timingSafeEqual(computedBuf, expectedBuf);

    if (isMatch) {
      if (!isCatalogUnlocked || !catalogDbInstance) {
        catalogDbInstance = new Database(CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
        isCatalogUnlocked = true;
        CatalogRepository.getInstance().initialize();
      }
      return { success: true, message: "Database unlocked successfully." };
    }

    // Factory key auto-migration removed to prevent unauthorized override (VULN-01)
    return { success: false, message: "Invalid DB_SECRET_KEY. Access to western_gun.db denied." };
  } catch (err: any) {
    return { success: false, message: err.message || "Failed to unlock catalog database." };
  }
}

export function getCatalogDatabase(): Database.Database {
  if (!isCatalogUnlocked || !catalogDbInstance) {
    throw new Error("Catalog database is currently LOCKED. Please unlock with master secret key first.");
  }
  return catalogDbInstance;
}

export function getRuntimeDatabase(): Database.Database {
  if (runtimeDbInstance) return runtimeDbInstance;

  const runtimeDir = path.dirname(CONFIG.RUNTIME_DB_PATH);
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }

  const db = new Database(CONFIG.RUNTIME_DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS player_sessions (
      session_token TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      ip_address TEXT,
      is_online INTEGER NOT NULL DEFAULT 1,
      last_seen TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_rooms (
      room_id TEXT PRIMARY KEY,
      host_id TEXT NOT NULL,
      status TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS active_session (
      match_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  runtimeDbInstance = db;
  return runtimeDbInstance;
}

export function getDatabase(): Database.Database {
  return getRuntimeDatabase();
}
