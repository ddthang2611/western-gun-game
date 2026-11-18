"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const BASE_DIR = fs_1.default.existsSync(path_1.default.resolve(__dirname, "..", "package.json"))
    ? path_1.default.resolve(__dirname, "..")
    : path_1.default.resolve(__dirname, "..", "..");
dotenv_1.default.config({ path: path_1.default.join(BASE_DIR, ".env") });
let fileConfig = {};
const configJsonPath = path_1.default.join(BASE_DIR, "config.json");
if (fs_1.default.existsSync(configJsonPath)) {
    try {
        fileConfig = JSON.parse(fs_1.default.readFileSync(configJsonPath, "utf-8"));
    }
    catch {
        fileConfig = {};
    }
}
exports.CONFIG = {
    HOST: process.env.HOST || fileConfig.server?.host || "0.0.0.0",
    PORT: Number(process.env.PORT || fileConfig.server?.port || 2611),
    DB_PATH: path_1.default.resolve(BASE_DIR, process.env.DB_PATH || fileConfig.database?.path || "./data/western_gun.db"),
    RUNTIME_DB_PATH: path_1.default.resolve(BASE_DIR, process.env.RUNTIME_DB_PATH || fileConfig.database?.runtime_path || "./data/western_gun_runtime.db"),
    DB_SECRET_KEY: process.env.DB_SECRET_KEY,
    SESSION_HMAC_SECRET: process.env.SESSION_HMAC_SECRET,
    CLOUDFLARED_SHA256: process.env.CLOUDFLARED_SHA256 || fileConfig.server?.cloudflared_sha256,
    ENABLE_TUNNEL: process.argv.includes("--tunnel") ||
        (process.env.ENABLE_TUNNEL !== "false" &&
            (process.env.ENABLE_TUNNEL === "true" || fileConfig.server?.enable_tunnel === true)),
    TUNNEL_DOMAIN: process.env.TUNNEL_DOMAIN || fileConfig.server?.tunnel_domain || null,
    BASE_DIR,
    CLIENT_DIST: path_1.default.join(BASE_DIR, "client", "dist"),
    ASSETS_DIR: path_1.default.join(BASE_DIR, "assets"),
    BIN_DIR: path_1.default.join(BASE_DIR, "bin"),
};
