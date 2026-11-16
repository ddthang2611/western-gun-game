"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDatabaseUnlocked = isDatabaseUnlocked;
exports.unlockCatalogDatabaseAsync = unlockCatalogDatabaseAsync;
exports.unlockCatalogDatabase = unlockCatalogDatabase;
exports.getCatalogDatabase = getCatalogDatabase;
exports.getRuntimeDatabase = getRuntimeDatabase;
exports.getDatabase = getDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const config_1 = require("../config");
const catalog_repository_1 = require("./catalog_repository");
const scryptAsync = (0, util_1.promisify)(crypto_1.default.scrypt);
let catalogDbInstance = null;
let runtimeDbInstance = null;
let isCatalogUnlocked = false;
function isDatabaseUnlocked() {
    return isCatalogUnlocked;
}
// Asynchronous unlock running on Libuv threadpool to prevent Event Loop starvation (VULN-03)
async function unlockCatalogDatabaseAsync(secretKey) {
    if (!fs_1.default.existsSync(config_1.CONFIG.DB_PATH)) {
        return { success: false, message: `Catalog database file not found at: ${config_1.CONFIG.DB_PATH}` };
    }
    try {
        const inspectDb = new better_sqlite3_1.default(config_1.CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
        const row = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_scrypt_hash'").get();
        const saltRow = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_salt'").get();
        inspectDb.close();
        if (!row || !saltRow) {
            return { success: false, message: "Database metadata missing security keys." };
        }
        const salt = saltRow.value;
        const storedHash = row.value;
        const computedBuf = (await scryptAsync(secretKey, salt, 32));
        const expectedBuf = Buffer.from(storedHash, "hex");
        const isMatch = computedBuf.length === expectedBuf.length && crypto_1.default.timingSafeEqual(computedBuf, expectedBuf);
        if (isMatch) {
            if (!isCatalogUnlocked || !catalogDbInstance) {
                catalogDbInstance = new better_sqlite3_1.default(config_1.CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
                isCatalogUnlocked = true;
                catalog_repository_1.CatalogRepository.getInstance().initialize();
            }
            return { success: true, message: "Database unlocked successfully." };
        }
        // Factory key auto-migration removed to prevent unauthorized override (VULN-01)
        return { success: false, message: "Invalid DB_SECRET_KEY. Access to western_gun.db denied." };
    }
    catch (err) {
        return { success: false, message: err.message || "Failed to unlock catalog database." };
    }
}
// Synchronous unlock for initial server startup and CLI prompt
function unlockCatalogDatabase(secretKey) {
    if (!fs_1.default.existsSync(config_1.CONFIG.DB_PATH)) {
        return { success: false, message: `Catalog database file not found at: ${config_1.CONFIG.DB_PATH}` };
    }
    try {
        const inspectDb = new better_sqlite3_1.default(config_1.CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
        const row = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_scrypt_hash'").get();
        const saltRow = inspectDb.prepare("SELECT value FROM db_meta WHERE key = 'secret_key_salt'").get();
        inspectDb.close();
        if (!row || !saltRow) {
            return { success: false, message: "Database metadata missing security keys." };
        }
        const salt = saltRow.value;
        const storedHash = row.value;
        const computedBuf = crypto_1.default.scryptSync(secretKey, salt, 32);
        const expectedBuf = Buffer.from(storedHash, "hex");
        const isMatch = computedBuf.length === expectedBuf.length && crypto_1.default.timingSafeEqual(computedBuf, expectedBuf);
        if (isMatch) {
            if (!isCatalogUnlocked || !catalogDbInstance) {
                catalogDbInstance = new better_sqlite3_1.default(config_1.CONFIG.DB_PATH, { readonly: true, fileMustExist: true });
                isCatalogUnlocked = true;
                catalog_repository_1.CatalogRepository.getInstance().initialize();
            }
            return { success: true, message: "Database unlocked successfully." };
        }
        // Factory key auto-migration removed to prevent unauthorized override (VULN-01)
        return { success: false, message: "Invalid DB_SECRET_KEY. Access to western_gun.db denied." };
    }
    catch (err) {
        return { success: false, message: err.message || "Failed to unlock catalog database." };
    }
}
function getCatalogDatabase() {
    if (!isCatalogUnlocked || !catalogDbInstance) {
        throw new Error("Catalog database is currently LOCKED. Please unlock with master secret key first.");
    }
    return catalogDbInstance;
}
function getRuntimeDatabase() {
    if (runtimeDbInstance)
        return runtimeDbInstance;
    const runtimeDir = path_1.default.dirname(config_1.CONFIG.RUNTIME_DB_PATH);
    if (!fs_1.default.existsSync(runtimeDir)) {
        fs_1.default.mkdirSync(runtimeDir, { recursive: true });
    }
    const db = new better_sqlite3_1.default(config_1.CONFIG.RUNTIME_DB_PATH);
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
function getDatabase() {
    return getRuntimeDatabase();
}
