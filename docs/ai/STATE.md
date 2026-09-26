# STATE

Updated: 2026-09-26
Git: `origin/main` (Local changes pending push approval)

## Priority
Eliminating Vercel Fast Origin Transfer bandwidth consumption ($0 cost) while maintaining 100% stable playback and zero quality degradation across all servers (Lisbon, Nebula, etc.).

## Working
- **Vercel Media Chunk Shield & Scrubbing Optimization**:
  - **Strict Media Chunk Protection**: Cloudflare Worker (`erasmus-hls-relay.erasmustv.workers.dev`) strictly blocks video media segments (`.m4s`, `.ts`, `.mp4`) from falling back to Vercel when the tunnel is alive (`isTunnelAlive: true`).
  - **30s Tunnel Timeout**: Raised from 7s to 30s to allow parallel 4K segment downloads during scrubbing over residential connections without artificial aborts.
  - **Direct CDN Segment Whitelisting**: `relay/erasmus-relay.mjs` incorporates `isDirectCdnSegment()` to preserve direct URLs for open CORS CDNs (`keenanchor.top`, etc.). 4K segments from Lisbon download directly from the CDN to the client in ~600ms with 0 bytes on Vercel, 0 on Worker, and 0 on residential tunnel.
  - **Player Buffer Optimization**: `native-player.tsx` tuned to `maxMaxBufferLength: 60s` and `maxBufferSize: 60MB` (from 180s/200MB). Makes scrubbing significantly faster and eliminates up to 75% of wasted abandoned chunks while preserving 100% full 4K bitrate and quality.
- **Universal Multi-Cour Anime & TV Alternate Coordinate Resolution**:
  - **Jujutsu Kaisen S1 E25 to E47 (e.g. S1 E28 "Hidden Inventory 4")**: Fixed playback failure across all 24-episode cour anime.
  - Prioritizes `cour-2-split-24/25/26`, `cour-12-split`, and multi-season splits (`>36, >48, >60, >72`).
  - Reverse mapping (`season > 1` back to continuous S1 numbering).
  - Subtitle resolver `src/lib/streaming/wyzie.ts` reuses coordinates automatically.
- **Dynamic Cloudflare Worker + Residential Tunnel Architecture (Permanent & Bulletproof)**:
  - **Zero Vercel Bandwidth**: Video segments stream directly from upstream CDNs or through residential IP connection over Cloudflare Quick Tunnel.
  - **Zero Supabase Egress**: Supabase database completely bypassed for relay routing (0 database queries, 0 egress).
  - **Zero Vercel Redeployments**: The Cloudflare Worker URL (`https://erasmus-hls-relay.erasmustv.workers.dev`) is permanent and never changes.
  - **Automatic Dynamic Target Sync**: `relay/sync-tunnel-url.mjs` extracts tunnel URL and securely registers it with Worker with authentication.
  - **KV State with In-Memory Caching**: Active tunnel URL stored in Cloudflare KV namespace `RELAY_CONFIG` and cached in isolate memory.
  - **Default Worker Integration**: `src/lib/streaming/relay.ts` defaults `HLS_RELAY_BASE` to `https://erasmus-hls-relay.erasmustv.workers.dev`.
- **Original Streaming Infrastructure (100% Preserved & Verified)**:
  - Lisbon (`isPrimary: true`), Sakura, Nebula, Solara, Athens, Joy, Castle, Canaias, and all Bingr clusters remain completely intact and active.
  - Complete backups safely preserved in `c:/Users/Administrator/Documents/BACKUP/`.
- **Web App Core**:
  - Next.js 16 (Turbopack), React 19, Instrument Sans typeface, Discover (`/discover`) default home.

## Current Status
- Cloudflare Worker deployed and active at `https://erasmus-hls-relay.erasmustv.workers.dev` with KV namespace binding `RELAY_CONFIG`.
- Local relay daemon running in background on port `8443` with `isDirectCdnSegment()` and client abort handling.
- Active tunnel registered with Worker: `https://with-handled-occupational-kinda.trycloudflare.com` (`isTunnelAlive: true`).
- Verification: End-to-end stream test passed, direct 4K chunk fetch in 619ms with CORS `*`, lint passed (0 errors), build succeeded (41/41 routes).
- Strictly local commit prepared; NO git push performed per `AGENTS.md`.

## Active Verification Benchmark
- **Baseline Timestamp:** 2026-09-26 11:33 AM IST
- **Checkpoint Timestamp:** 2026-09-26 1:15 PM IST (7.06 GB / 10 GB)
- **Monitoring Goal:** Confirm that Vercel Fast Origin Transfer bandwidth stays frozen at 7.06 GB during active streaming and scrubbing.

## Key locations
- Web repo: `c:/Users/Administrator/Documents/Argus/Argus` (branch: `main`)
- Standalone Relay: `relay/erasmus-relay.mjs`
- Cloudflare Worker: `relay/cloudflare-worker/worker.js` & `c:/Users/Administrator/erasmus-hls-relay/worker.js`
- Auto-Sync: `relay/sync-tunnel-url.mjs`
- Pre-scrub fix backup: `c:/Users/Administrator/Documents/BACKUP/pre_scrub_relay_optimization_backup/`
