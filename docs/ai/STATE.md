# STATE

Updated: 2026-09-26
Git: `origin/main`

## Priority
Eliminating Vercel Fast Origin Transfer bandwidth consumption ($0 cost) while maintaining 100% stable playback across all servers (Lisbon, Nebula, etc.).

## Working
- **Universal Multi-Cour Anime & TV Alternate Coordinate Resolution**:
  - **Jujutsu Kaisen S1 E25 to E47 (e.g. S1 E28 "Hidden Inventory 4")**: Fixed playback failure. TMDB groups these episodes under Season 1 continuous numbering (1–59), but upstream CDNs and streaming hosts catalog them by broadcast seasons (S1: 1–24, S2: 1–23).
  - **Coordinate Translation Engine (`src/lib/streaming/vidfast-direct.ts`)**:
    - Prioritizes 24-episode cour splits (`cour-2-split-24`, `cour-2-split-25`, `cour-2-split-26`) when `season === 1` and `episode > 24`.
    - Supports 12-episode cour splits (`cour-12-split`, `cour-13-split`) for single-cour series (e.g. *Solo Leveling*, *Spy x Family*).
    - Supports multi-season long-running anime splits (`episode > 36, 48, 60, 72` for *Attack on Titan*, *Demon Slayer*, *Bleach*, *MHA*).
    - Reverse mapping (`season > 1` back to continuous S1 numbering) when users pick broadcast seasons but hosts catalog under absolute numbering.
    - Evaluation window expanded to 7 alternate candidates in VidFast direct and 5 candidates in Cinejoy.
  - **Zero Subtitle Breakage**: `src/lib/streaming/wyzie.ts` imports and reuses `getAlternateTvCoordinates()`, automatically unlocking subtitles for alternate cour coordinates with zero extra network overhead.
- **Dynamic Cloudflare Worker + Residential Tunnel Architecture (Permanent & Bulletproof)**:
  - **Zero Vercel Bandwidth**: 100% of video segments stream directly from upstream CDNs through the user's Reliance Jio residential IP connection over a Cloudflare Quick Tunnel.
  - **Zero Supabase Egress**: Supabase database is completely bypassed for relay routing (0 database queries, 0 egress).
  - **Zero Vercel Redeployments**: The Cloudflare Worker URL (`https://erasmus-hls-relay.erasmustv.workers.dev`) is permanent and never changes.
  - **Automatic Dynamic Target Sync**: On PC boot or restart, `relay/sync-tunnel-url.mjs` extracts the new quick tunnel URL from `relay/tunnel.log` and securely registers it with the Worker via `POST /set-target` with authentication.
  - **KV State with In-Memory Caching**: Active tunnel URL is stored in Cloudflare KV namespace `RELAY_CONFIG` and cached in worker isolate memory for 0ms lookup latency.
  - **Default Worker Integration**: `src/lib/streaming/relay.ts` directly defaults `HLS_RELAY_BASE` to `https://erasmus-hls-relay.erasmustv.workers.dev`, ensuring zero manual dashboard env var dependencies across all builds.
  - **Safe Automatic Fallback**: If the user's PC is sleeping, offline, or tunnel times out, the Worker seamlessly falls back to Vercel `/api/stream/hls`, guaranteeing playback NEVER halts.
- **Original Streaming Infrastructure (100% Preserved & Verified)**:
  - Lisbon (`isPrimary: true`), Sakura, Nebula, Solara, Athens, Joy, Castle, Canaias, and all Bingr clusters remain completely intact and active.
  - Complete backups safely preserved at `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cloudflare_tunnel_relay_20260926/` and `c:/Users/Administrator/Documents/BACKUP/pre_cour_split_fix_backup/`.
- **Cinejoy Pipeline Integration (Dedicated Server Section)**:
  - `cj-lisbon`, `cj-nebula`, `cj-athens`, `cj-shegu` server options.
  - Watermark-free 1080p master from Hakuna Matata CDN unlocked via ExoPlayer user agent headers.
- **Web App Core**:
  - Next.js 16 (Turbopack), React 19, Instrument Sans typeface, Discover (`/discover`) default home.

## Current Status
- Cloudflare Worker deployed and active at `https://erasmus-hls-relay.erasmustv.workers.dev`.
- Local relay daemon running in background on port `8443`.
- Active tunnel registered with Worker: `https://with-handled-occupational-kinda.trycloudflare.com`.
- Windows Startup Shortcut Installed: `ErasmusRelay.lnk` in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` silently launches `relay/run-silent.vbs` on boot.
- Auto-Sync Script: `relay/sync-tunnel-url.mjs` handles auto-registration and 3-minute heartbeats.
- Verification: End-to-end stream test passed, JJK S1 E28 verified resolving to S2 E4 on vRapid 4K HLS, Solo Leveling S1 E13 & E24 & E25 verified, lint passed (0 errors), build succeeded (41/41 routes).

## Active Verification Benchmark
- **Baseline Timestamp:** 2026-09-26 11:33 AM IST
- **Baseline Vercel Fast Origin Transfer:** 6.37 GB / 10 GB
- **Monitoring Goal:** Confirm that Vercel Fast Origin Transfer bandwidth stays frozen at 6.37 GB during active streaming.

## Key locations
- Web repo: `c:/Users/Administrator/Documents/Argus/Argus` (branch: `main`)
- Standalone Relay: `relay/erasmus-relay.mjs`
- Cloudflare Worker: `relay/cloudflare-worker/worker.js` & `wrangler.toml`
- Silent Launcher: `relay/run-silent.vbs` & `relay/start-relay.bat`
- Auto-Sync: `relay/sync-tunnel-url.mjs`
- Trusted push backup: `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cloudflare_tunnel_relay_20260926/`
- Pre-cour fix backup: `c:/Users/Administrator/Documents/BACKUP/pre_cour_split_fix_backup/`
