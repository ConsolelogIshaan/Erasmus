# STATE

Updated: 2026-09-27
Git: `main` (Clean working tree, up to date with origin/main)

## Priority
Eliminating Vercel Fast Origin Transfer bandwidth consumption ($0 cost) while maintaining 100% stable playback and zero quality degradation across all servers (Lisbon, Nebula, Polaris, etc.).

## Working
- **Gossip Girl (2007, TMDB 1395) Playback & Upstream Misindex Shield**:
  - **Root Cause Identified**: Upstream VidFast (`vidfast.vc`) mistakenly indexed Season 1 episodes 1, 3, 4, 7, 8, and 9 of TMDB `1395` (the authentic 2007–2012 CW series starring Leighton Meester and Blake Lively) with media files belonging to the 2021 HBO Max Gossip Girl Remake (TMDB `95249`). These files returned `RESOLUTION=3840x1920` (Univisium 2:1 aspect ratio, ~57m runtime). Because VidFast returned 200 OK with active 4K streams, the previous resolver accepted them and served the 2021 remake on Lisbon, Nebula, and other VidFast-preferred servers.
  - **Full Catalog Audit (All 121 Episodes Verified)**:
    - **Season 1 (18 episodes)**: Episodes 1, 3, 4, 7, 8, 9 on VidFast were corrupted by the 2021 remake. Episodes 2, 5, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18 on VidFast were 100% authentic 2007 original show (`1920x1080` 16:9).
    - **Season 2 (25 episodes)**: S2 E1 through S2 E25 are 100% authentic 2007 original show (`1920x1080` 16:9).
    - **Season 3 (22 episodes)**: S3 E1 through S3 E22 are 100% authentic 2007 original show (`1920x1080` 16:9).
    - **Season 4 (22 episodes)**: S4 E1 through S4 E22 are 100% authentic 2007 original show (`1920x1080` 16:9).
    - **Season 5 (24 episodes)**: S5 E1 through S5 E24 are 100% authentic 2007 original show (`1920x1080` 16:9).
    - **Season 6 (10 episodes)**: S6 E1 through S6 E10 are 100% authentic 2007 original show (`1920x1080` 16:9).
    - Summary: Exactly 6 episodes out of 121 were corrupted on upstream VidFast.
  - **Upstream Guard in `src/lib/streaming/vidfast-direct.ts`**:
    - In `resolveVidfastDirectStreamSingle` and `resolveVidfastDirectStream`, immediately rejects requests for TMDB `1395` Season 1 episodes `[1, 3, 4, 7, 8, 9]`.
    - Added dynamic aspect ratio & resolution rejection: any candidate for TMDB `1395` returning 4K / 2160p / 3840 (the 2021 remake Univisium ratio) is automatically rejected.
  - **Multi-Server Edge Fallback in `src/lib/streaming/direct-stream.ts`**:
    - When VidFast rejects the remake stream, `extractDirectStream` immediately cascades to Vidlink (`resolveVidlinkStream`), providing the authentic 2007 1080p stream from Hakuna Matata CDN (duration 2557s = 42m37s, English subtitles).
    - If Vidlink is unavailable, cascades to Bingr/Bastion (`s62`), which holds verified authentic 2007 CW broadcasts with synced English CC subtitles ("GOSSIP GIRL: Hey, Upper East Siders, Gossip Girl here...").
    - Verified across all servers: Lisbon, Nebula, Aphelion, Polaris, Bastion, Solara, Athens, Joy, Castle, and Canaias now all deliver the authentic 2007 original show.
- **Polaris Server Direct Playback & Bingr Resolver Hardening**:
  - Fixed premature request timeout in `src/lib/streaming/bingr-stream.ts` where Polaris (`s70` - Hakunaymatata upstream) was previously capped at 2.8s (`AbortSignal.timeout(2800)`); increased timeout to 12s for targeted requests and 8s for fallbacks, matching Bingr's client architecture.
  - Whitelisted `hakunaymatata.com` in `checkIsDirectCors` (`bingr-stream.ts`) and `isDirectCdnSegment` (`src/app/api/stream/hls/route.ts`), preventing unnecessary Vercel proxying on open CDN segments.
  - Added intelligent audio language priority in `resolveBingrStream` so English audio is prioritized over alternate audio dubs when multiple tracks are returned.
  - Expanded cascade candidate depth from 2 to 3 servers so Polaris is included in automated fallbacks when Aphelion and Bastion have 0 sources.
  - Verified working playback extraction for *Overcompensating* (TMDB ID 247619) with 1080p fMP4 HLS master playlist, direct CORS, and synced subtitles.
- **Vercel Media Chunk Shield & Scrubbing Optimization**:
  - **Strict Media Chunk Protection**: Cloudflare Worker (`erasmus-hls-relay.erasmustv.workers.dev`) strictly blocks video media segments (`.m4s`, `.ts`, `.mp4`) from falling back to Vercel when the tunnel is alive (`isTunnelAlive: true`).
  - **30s Tunnel Timeout**: Raised from 7s to 30s to allow parallel 4K segment downloads during scrubbing over residential connections without artificial aborts.
  - **Direct CDN Segment Whitelisting**: `relay/erasmus-relay.mjs` incorporates `isDirectCdnSegment()` to preserve direct URLs for open CORS CDNs (`keenanchor.top`, `hakunaymatata.com`, etc.). 4K segments from Lisbon download directly from the CDN to the client in ~600ms with 0 bytes on Vercel, 0 on Worker, and 0 on residential tunnel.
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
  - Lisbon (`isPrimary: true`), Sakura, Nebula, Solara, Athens, Joy, Castle, Canaias, Polaris, and all Bingr clusters remain completely intact and active.
  - Complete backups safely preserved in `c:/Users/Administrator/Documents/BACKUP/`.
- **Web App Core**:
  - Next.js 16 (Turbopack), React 19, Instrument Sans typeface, Discover (`/discover`) default home.

## Current Status
- Verified playback for Gossip Girl (TMDB 1395) across all servers: Lisbon, Nebula, Aphelion, Polaris, Bastion, and Solara.
- All 17 automated tests in `src/lib/streaming/direct-stream.test.ts` passed.
- `npm run typecheck` passed (0 errors).
- `npm run lint` passed (0 errors).
- `npm run build` compiled all 41 routes successfully.
- Commits `3796757` and `9360f95` pushed to `origin/main` upon explicit user command.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` / `c:/Users/Administrator/Documents/Argus/Argus` (branch: `main`)
- Standalone Relay: `relay/erasmus-relay.mjs`
- Cloudflare Worker: `relay/cloudflare-worker/worker.js` & `c:/Users/Administrator/erasmus-hls-relay/worker.js`
- Auto-Sync: `relay/sync-tunnel-url.mjs`
- Pre-scrub fix backup: `c:/Users/Administrator/Documents/BACKUP/pre_scrub_relay_optimization_backup/`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
