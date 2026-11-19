# Monopoly & Get Rich! (`monopolyweb`)

Standalone remake of the **Monopoly (Classic & Get Rich!)** gamemode built for **Cloudflare Workers with Static Assets** (`https://monopolyweb.johansans999.workers.dev`) and a **Host-and-Peer WebRTC DataChannel** multiplayer architecture (with automatic WebSocket relay fallback and Host Migration).

## Cloudflare Workers Git Integration Settings

When connecting this repository in the Cloudflare Dashboard (**Workers & Pages → Create → Workers → Connect to Git**):
- **Worker Name**: `monopolyweb` (automatically maps to `monopolyweb.johansans999.workers.dev`)
- **Build command**: `npm run build`
- **Deploy command**: `npx wrangler deploy`

## Architecture

- **Cloudflare Worker (`worker/index.ts`)**: Serves the React SPA (`dist/client`, including bundled stickers) and routes `/api/rooms/:code/ws` to Durable Objects.
- **`SignalRoomDO` (`worker/SignalRoomDO.ts`)**: SQLite-backed Durable Object using the WebSocket Hibernation API (Cloudflare Free Tier compatible). Handles 4-character room codes, WebRTC SDP/ICE signaling, automatic WebSocket relay fallback if NAT blocks P2P, and 5-second grace-period Host Migration.
- **Unified Engine (`src/engine/`)**: Single pure TypeScript authoritative engine used identically in Singleplayer (local Host) and Online Multiplayer (Host browser).
- **Host-and-Peer Networking (`src/net/`)**: `HostController`, `PeerClient`, `WebRtcPeerLink`, and `RoomSession`.

## Commands

```bash
# Local full-stack dev (Vite + local Cloudflare Worker & Durable Object)
npm run dev

# Typecheck (app + worker)
npm run typecheck

# Run automated unit tests (engine bug-fixes + host/peer sync & migration)
npm test

# Build & deploy to Cloudflare Workers
npm run deploy
```
