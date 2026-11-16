import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const BASE_DIR = fs.existsSync(path.resolve(__dirname, "..", "package.json"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(BASE_DIR, ".env") });

let fileConfig: Record<string, any> = {};
const configJsonPath = path.join(BASE_DIR, "config.json");
if (fs.existsSync(configJsonPath)) {
  try {
    fileConfig = JSON.parse(fs.readFileSync(configJsonPath, "utf-8"));
  } catch {
    fileConfig = {};
  }
}

export const CONFIG = {
  HOST: process.env.HOST || fileConfig.server?.host || "0.0.0.0",
  PORT: Number(process.env.PORT || fileConfig.server?.port || 2611),
  DB_PATH: path.resolve(BASE_DIR, process.env.DB_PATH || fileConfig.database?.path || "./data/western_gun.db"),
  RUNTIME_DB_PATH: path.resolve(
    BASE_DIR,
    process.env.RUNTIME_DB_PATH || fileConfig.database?.runtime_path || "./data/western_gun_runtime.db"
  ),
  DB_SECRET_KEY: process.env.DB_SECRET_KEY,
  SESSION_HMAC_SECRET: process.env.SESSION_HMAC_SECRET,
  ENABLE_TUNNEL:
    process.argv.includes("--tunnel") ||
    process.env.ENABLE_TUNNEL === "true" ||
    fileConfig.server?.enable_tunnel === true,
  TUNNEL_DOMAIN: process.env.TUNNEL_DOMAIN || fileConfig.server?.tunnel_domain || null,
  BASE_DIR,
  CLIENT_DIST: path.join(BASE_DIR, "client", "dist"),
  ASSETS_DIR: path.join(BASE_DIR, "assets"),
  BIN_DIR: path.join(BASE_DIR, "bin"),
};
