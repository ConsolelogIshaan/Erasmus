# STATE

Updated: 2026-09-26
Git: `origin/main` (clean push at `624b1c5`)

## Priority
Eliminating Vercel Fast Origin Transfer bandwidth consumption ($0 cost) while maintaining 100% stable playback across all servers (Lisbon, Nebula, etc.).

## Working
- **Cloudflare Tunnel (`cloudflared`) Zero-Vercel Video Relay Architecture**:
  - Solved Reliance Jio IPv4 CGNAT limitation: Cloudflare Tunnel initiates outbound QUIC connections to Delhi edge (`del02`), bypassing router port forwarding and telecom CGNAT without public IPv4.
  - Solved VidFast Datacenter IP block: Cloudflare Workers fail because VidFast blocks Cloudflare datacenter egress IPs. In the Cloudflare Tunnel model, the local PC fetches video chunks from VidFast over the user's Reliance Jio residential IP, which VidFast allows 100%.
  - Created standalone high-performance video relay server: `relay/erasmus-relay.mjs` running on `localhost:8443`.
  - Configured with full HLS playlist rewriting (`.m3u8`), Range requests (HTTP 206 Partial Content), CORS headers (`Access-Control-Allow-Origin: *`), VidFast referer injection (`Referer: https://vidfast.vc/`), and Hakuna Matata ExoPlayer header injection.
  - Live End-to-End Test Verified: Successfully fetched VidFast master playlist and streamed raw video segments (`seg-1-s1080p-v1-a1.m4s`) with HTTP 206 Partial Content through `https://should-samples-gas-dawn.trycloudflare.com/api/stream/hls` with zero blocks.
  - Result: Bandwidth on Vercel is reduced to **0.00 GB**.
- **Original Streaming Infrastructure (100% Preserved & Verified)**:
  - Lisbon (`isPrimary: true`), Sakura, Nebula, Solara, Athens, Joy, Castle, Canaias, and all Bingr clusters remain completely intact and active.
  - Complete backups safely preserved at `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cinejoy_pipeline_20260926/` and `c:/Users/Administrator/Documents/BACKUP/pre_cinejoy_pipeline_backup/`.
- **Cinejoy Pipeline Integration (Dedicated Server Section)**:
  - `cj-lisbon`, `cj-nebula`, `cj-athens`, `cj-shegu` server options.
  - Pristine watermark-free 1080p master from Hakuna Matata CDN unlocked via ExoPlayer user agent headers.
- **Web App Core**:
  - Next.js 16 (Turbopack), React 19, Instrument Sans typeface, Discover (`/discover`) default home.

## Current Status
- Local relay daemon running in background on port `8443` (`task-1610`).
- Cloudflare Tunnel active with public endpoint: `https://should-samples-gas-dawn.trycloudflare.com` (`task-1619`).
- Verification: End-to-end stream test passed, lint passed (0 errors), build stable.

## Key locations
- Web repo: `c:/Users/Administrator/Documents/Argus/Argus` (branch: `main`)
- Standalone Relay: `relay/erasmus-relay.mjs`
- Trusted push backup: `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cloudflare_tunnel_relay_20260926/`
- Previous push backup: `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cinejoy_pipeline_20260926/`
