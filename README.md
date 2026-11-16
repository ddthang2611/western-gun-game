# Western Gun Game — v1.0.0 (Cloudflare Global Edition)

Multiplayer tactical Western card game (3 to 8 players) pre-built and bundled with **Cloudflare Quick Tunnel** so international and remote players can join directly from any modern web browser via a public `https://*.trycloudflare.com` link without port forwarding or VPNs.

---

## 1. Pre-Built Release Architecture

This repository includes the compiled production artifacts ready to run out of the box:

- **Compiled Web Client**: `client/dist/` (Production React + Vite bundle)
- **Compiled Authoritative Server**: `dist/index.js` (Node.js production server)
- **Encrypted SQLite Catalog Database**: `data/western_gun.db` (120 cards, 31 characters, 4 roles, 28 events)
- **Cloudflare Tunnel Integration**: Automatically locates or downloads `bin/cloudflared` on first run

---

## 2. Quick Start — Host Global Match via Cloudflare

1. Install production dependencies and configure your environment file:

```bash
npm install
cp .env.example .env
```

2. Set your `DB_SECRET_KEY` and `SESSION_HMAC_SECRET` inside `.env` (or enter the database security key via the terminal / Web UI prompt on startup).

3. Start the server with Cloudflare Tunnel enabled:

```bash
npm start
```

What happens on startup:

1. **Database Unlock**: Reads `DB_SECRET_KEY` from `.env` to unlock `data/western_gun.db` (or prompts on the console / Web UI if not set in `.env`).
2. **Local & LAN Binding**: Listens on `0.0.0.0:2611`.
3. **Cloudflare Global Tunnel**: Automatically starts `cloudflared` and prints a public HTTPS URL in the terminal:

```text
=======================================================
Western-gun-game Server is RUNNING on Port: 2611
- Local Access:   http://localhost:2611
- LAN (Wi-Fi):    http://192.168.1.x:2611
- Cloudflare:     Initializing Quick Tunnel...
- Cloudflare:     https://<random-name>.trycloudflare.com (Public Internet Access)
=======================================================
```

### How Foreign / Remote Players Join by Browser

1. Copy the `https://<random-name>.trycloudflare.com` link from the console (or click **Copy** next to **Invite via Global Cloudflare Link** inside the Lobby screen).
2. Send the link to players anywhere in the world.
3. Players open the link in Chrome, Firefox, Edge, or Safari on desktop/mobile — no installation required.
4. Each player enters a **Player Name** and a **4-digit PIN** to log in and join the room. If a player's connection drops, logging back in with the same Name + PIN immediately restores their seat and cards.

---

## 3. Network Modes & Port Configuration

### Mode A: Cloudflare Quick Tunnel (Default — Zero Router / Firewall Setup)

Enabled automatically via `npm start` (or `npm run start:tunnel`), `ENABLE_TUNNEL=true` in `.env`, or `"enable_tunnel": true` in `config.json`.

- Tunnels local port `2611` outbound to Cloudflare's global edge network over HTTPS/WSS (`443`).
- Automatically whitelists `*.trycloudflare.com` in CORS and WebSocket Origin security checks.
- Reads `cf-connecting-ip` so per-player PIN rate-limiting works accurately for each remote player behind the tunnel.

### Mode B: Local Area Network (LAN / Wi-Fi Only)

To run without opening a public Cloudflare tunnel:

```bash
npm run start:local
```

If players on the same Wi-Fi cannot connect to `http://<LAN_IP>:2611`, allow inbound TCP port `2611` on the host firewall:

- **Linux (UFW)**: `sudo ufw allow 2611/tcp`
- **Linux (firewalld)**: `sudo firewall-cmd --add-port=2611/tcp --permanent && sudo firewall-cmd --reload`
- **Windows (PowerShell Admin)**:
  ```powershell
  New-NetFirewallRule -DisplayName "Western Gun Game TCP 2611" -Direction Inbound -LocalPort 2611 -Protocol TCP -Action Allow
  ```

### Mode C: Custom Domain / Direct Public IP (Router Port Forwarding)

1. Forward external **TCP Port 2611** on your router to the host machine's LAN IP (`2611`).
2. If using a custom domain, set `TUNNEL_DOMAIN=your-domain.com` in `.env` (or `"tunnel_domain": "your-domain.com"` in `config.json`) to authorize WebSocket connections from that domain.

---

## 4. Development & Rebuilding

If modifying source code:

```bash
npm run setup
npm run build
```

---

## 5. Disclaimer

Non-commercial fan and educational software engineering project. All tabletop card game mechanics and Wild West themes are inspired by classic Western board games. All third-party trademarks belong to their respective owners.
