# STATE

Updated: 2026-09-28 1:12 PM IST
Git: `origin/main` (pushed to origin/main per explicit user command; verified build, lints, and typecheck)

## Priority
High-speed residential streaming bridge: fully optimized, hardened, and verified.
Zero Vercel involvement (completely eliminated). Zero Cloudflare Error 1102 / CPU limit risk.
VidFast (Lisbon 4K) prioritized and streaming seamlessly with sub-second startup.

## Current Architecture & Topology
1. **Local High-Speed Video Relay (`relay/erasmus-relay.mjs`)**:
   - Runs locally on port `8443` over Reliance Jio residential connection (never blocked by VidFast/quietnexus/northcoral).
   - Preserves caller host: when called on `localhost:8443`, child variant and segment URLs stay on `localhost:8443` (0ms external latency).
   - When called through the Cloudflare Tunnel, child variant and segment URLs stay on the tunnel URL directly, completely bypassing the Cloudflare Worker for all 3,600+ media chunks.
   - Built-in multi-audio English promotion (`enrichAudioTracks`), automatic SRT-to-WebVTT conversion, and local direct stream resolution endpoint (`/api/stream/direct`).

2. **Cloudflare Quick Tunnel (`cloudflared`)**:
   - Connects `localhost:8443` to Cloudflare's Anycast edge without exposing ports or requiring static IP/port forwarding.
   - Live tunnel auto-discovered and registered by `relay/sync-tunnel-url.mjs` within 200ms of startup.

3. **Cloudflare Dynamic Smart Relays**:
   - Primary: `https://erasmus-hls-relay.erasmustv.workers.dev` (Account 1: `shrdsubscriptions@gmail.com`)
   - Standby: `https://erasmus-hls-relay.ishaan-jangid1.workers.dev` (Account 2: `ishaan.jangid1@gmail.com`)
   - Both workers dynamically track active tunnel URL via authenticated `POST /set-target`.
   - Vercel fallback completely stripped from Worker and frontend code (`0 MB on Vercel`).
   - If bridge is sleeping, workers fall back cleanly to direct edge proxy for open CDNs (Aphelion/Bastion/Vidlink).

4. **Web Application & Dev Environment**:
   - `src/lib/streaming/relay.ts`: Automatically detects `window.location.hostname === 'localhost'` and binds directly to `http://localhost:8443` for zero-overhead local playback.
   - `src/lib/streaming/direct-stream.ts`: Removed all calls to `erasmus-nine.vercel.app`. Resolves directly on Node/PC or queries tunnel when on Cloudflare.

## Verification Summary
- **Master & Segment Streaming Tests**:
  - `http://localhost:8443`: Master 200 OK, Segment 206 Partial Content in 12ms.
  - `https://scratch-tasks-shopping-wildlife.trycloudflare.com`: Master 200 OK, Segment 206 Partial Content.
  - `https://erasmus-hls-relay.erasmustv.workers.dev`: Master 200 OK, Segment 206 Partial Content.
  - `https://erasmus-hls-relay.ishaan-jangid1.workers.dev`: Master 200 OK, Segment 206 Partial Content.
- **Direct Stream Resolution**:
  - TMDB 168259 (Furious 7) -> `vRapid` 4K master playlist resolved in ~800ms.
- **Build & Quality Gates**:
  - `npx tsc --noEmit`: 0 errors.
  - `npm run lint`: 0 errors.
  - `npm run build`: Production build succeeded across all 47 routes.
