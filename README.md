# Western Gun Game

Authoritative multiplayer Western tactical card duel (3 to 8 players) featuring a React + TypeScript client, Node.js WebSocket game engine, SQLite encrypted catalog (`schema_version 1.3.0`), bilingual `EN | VI` UI, and Cloudflare Quick Tunnel support for remote play over HTTPS/WSS.

---

## 1. Core Features & Architecture

- **Web Client (`client/`)**: React + Vite + TypeScript SPA with segmented `EN | VI` language switching, optional bilingual card tooltips, responsive table console, Card Arena flight animations, and `/dev-test` UI sandbox.
- **Authoritative Server (`server/`)**: Express HTTP API + WebSocket server running deterministic turn phases, Fog-of-War snapshot filtering, sequential `ArenaChainManager` resolution, and Fog-of-War structured combat logs.
- **Encrypted Catalog DB (`data/western_gun.db`)**: SQLite database (via `better-sqlite3`) containing 56 card templates (120 cards across Base & Dodge City), 31 characters, 4 roles, 28 events, 14 symbol grammar definitions, and bilingual (`_en` / `_vi`) descriptions.
- **Runtime Persistence (`data/western_gun_runtime.db`)**: Stores player PIN sessions (`HttpOnly`, `SameSite=Strict` cookies), room lobby state, and match recovery snapshots.
- **Cloudflare Tunnel (`bin/cloudflared`)**: Optional outbound Quick Tunnel exposing local port `2611` at `https://*.trycloudflare.com` with zero router configuration.

### Terminology & Bilingual Support

Players can toggle between **English (`EN`)** and **Vietnamese (`VI`)** at any time from Auth, Lobby, Dev Sandbox, or the Game Table top bar, as well as enable **Bilingual Cards (`2L Cards` / `Song ngữ`)** inside card popovers while preserving canonical card names across mixed-language tables.

Core mechanical terms are standardized across cards, characters, arena tags, and combat logs:
- **Draw / Steal / Choose**: Take from deck (`Rút`) vs. take from another player (`Cướp`) vs. draft/select (`Chọn lấy`).
- **Check (`check the top card`) / `Xét` (`xét lá bài trên cùng`)**: Reveal top deck card(s) without adding to hand (Barrel, Jourdonnais, Jail, Dynamite, Lucky Duke).
- **Discard vs. Remove**: Voluntary/cost discard (`Bỏ bài`) vs. forced removal from hand or in play (`Hủy bài`).
- **Activate / Cancel**: Trigger green delayed cards (`Kích hoạt`) and negate incoming shots (`Hủy` / `Né`).

---

## 2. Quick Start

### Prerequisites

- Node.js 20+ and npm

### Setup & Configuration

1. Install root and client dependencies:

```bash
npm run setup
```

2. Create `.env` from the template and configure `DB_SECRET_KEY` and `SESSION_HMAC_SECRET`:

```bash
cp .env.example .env
```

3. Build client bundle, compile server TypeScript (`dist/`), and seed `data/western_gun.db`:

```bash
npm run build
```

4. Start the production server with Cloudflare Quick Tunnel enabled:

```bash
npm start
```

Startup flow:
1. Unlocks `data/western_gun.db` using `DB_SECRET_KEY` from `.env` (or prompts via console / Auth UI if unset).
2. Binds HTTP and WebSocket server on `0.0.0.0:2611`.
3. Starts `cloudflared` (when enabled) and prints local, LAN, and public `https://*.trycloudflare.com` URLs.

### Joining a Match

1. Share the LAN or `trycloudflare.com` URL from the console or the Lobby invite panel.
2. Players enter a **Player Name** (max 20 characters in UI) and a **4-digit PIN** in any desktop or mobile browser.
3. Disconnected players automatically restore their seat, hand, and active session upon signing back in with the same Name + PIN.

---

## 3. Network Modes & Configuration

Settings resolve from environment variables in `.env` with fallback to `config.json`:

### Mode A: Cloudflare Quick Tunnel (Default)

Enabled by `npm start` (`--tunnel`), `ENABLE_TUNNEL=true` in `.env`, or `"server": { "enable_tunnel": true }` in `config.json`.
- Forwards local port `2611` outbound via HTTPS/WSS (`443`).
- Authorizes `*.trycloudflare.com` origins and honors `cf-connecting-ip` for per-IP rate limiting.

### Mode B: Local Area Network (LAN / Wi-Fi Only)

```bash
npm run start:local
```

Allow inbound TCP port `2611` on the host firewall if LAN clients cannot reach `http://<LAN_IP>:2611`:
- **Linux (UFW)**: `sudo ufw allow 2611/tcp`
- **Linux (firewalld)**: `sudo firewall-cmd --add-port=2611/tcp --permanent && sudo firewall-cmd --reload`
- **Windows (PowerShell Admin)**:
  ```powershell
  New-NetFirewallRule -DisplayName "Western Gun Game TCP 2611" -Direction Inbound -LocalPort 2611 -Protocol TCP -Action Allow
  ```

### Mode C: Custom Domain / Direct Public IP

1. Forward external **TCP Port 2611** on your router to the host LAN IP.
2. Set `TUNNEL_DOMAIN=your-domain.com` in `.env` or `"server": { "tunnel_domain": "your-domain.com" }` in `config.json`.

---

## 4. Available NPM Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run setup` | Install dependencies for server and client |
| `npm run build` | Build `client/dist/`, compile server to `dist/`, and seed SQLite DB |
| `npm start` | Run compiled `dist/index.js --tunnel` |
| `npm run start:local` | Run compiled `dist/index.js` without tunnel |
| `npm run server:dev` | Run server in watch mode via `tsx` |
| `npm run client:dev` | Run Vite dev server for `client/` |
| `npm run client:build` | Type-check and build `client/dist/` |
| `npm run db:seed` | Rebuild `data/western_gun.db` from `assets/cards_manifest.json` |
| `npm test` | Run engine comprehensive test suite (`scripts/test_engine_comprehensive.ts`) |
| `npm --prefix client run lint` | Run ESLint on `client/` |

---

## 5. Disclaimer

Non-commercial fan and educational software engineering project. Tabletop card mechanics and Wild West themes are inspired by classic Western board games. All third-party trademarks belong to their respective owners.
