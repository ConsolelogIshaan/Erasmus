# STATE

Updated: 2026-09-26
Git: `origin/main` (pushed per explicit user instruction with verified trusted backups)

## Priority
Streaming architecture and playback reliability. Introduced dedicated Cinejoy Pipeline test servers (`cj-lisbon`, `cj-nebula`, `cj-athens`, `cj-shegu`) in the player server selector to test direct CDN streaming and HEVC 1080p master delivery, while keeping 100% of existing streaming services untouched and fully functional.

## Working
- **Original Streaming Infrastructure (100% Preserved & Verified)**:
  - Lisbon (`isPrimary: true`), Sakura, Nebula, Solara, Athens, Joy, Castle, Canaias, and all Bingr clusters remain completely intact and active.
  - Complete backups safely preserved at `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cinejoy_pipeline_20260926/` and `c:/Users/Administrator/Documents/BACKUP/pre_cinejoy_pipeline_backup/`.
- **Cinejoy Pipeline Integration (Dedicated Server Section)**:
  - Added dedicated server IDs in `src/lib/streaming/stream-resolver.ts`:
    - `cj-lisbon`: Lisbon (Cinejoy 4K) — 4K Master HLS ladder with auto-adaptive failover.
    - `cj-nebula`: Nebula (Cinejoy Edge) — Pristine theatrical edge CDN (Hakuna Matata 1080p master, zero watermark).
    - `cj-athens`: Athens (Cinejoy 4K) — High-bitrate 4K cinema direct stream mirror.
    - `cj-shegu`: Shegu (Cinejoy Core) — Encrypted Shegu binary multi-source cluster.
  - Added dedicated UI section in `src/features/streaming/components/servers-modal.tsx`:
    - Renders "CINEJOY PIPELINE (DIRECT & ZERO-BUFFER BETA)" with cyan accent badge between Direct Streams and Embed Fallback Players.
  - Unlocked **Hakuna Matata CDN** (pristine 1080p master copy):
    - Configured `src/app/api/stream/hls/route.ts` to identify Hakuna Matata requests and pass `User-Agent: ExoPlayer/1.5.1 (Linux; Android TV)` with empty referer, matching `TvPlayerScreen.kt:L211-216` in the TV app.
    - Updated `resolveVidlinkStream` in `src/lib/streaming/cinejoy-stream.ts` to accept Hakuna Matata direct streams.
    - Prioritized `resolveVidlinkStream` first for `cj-nebula` to match `CinejoyStreamResolver.kt:L335-340`.
    - Tested seeking, audio/video synchronization, and frame extraction: 1920x800 theatrical aspect ratio, full 2:24:38 runtime, zero betting watermarks.
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Typography: Instrument Sans Typeface.
- Primary Home & Default Landing: Discover (`/discover`).
- Supabase Egress & Bandwidth Optimization.

## Current Status
- **Hakuna Matata CDN Integration Complete**:
  - Web app now streams the identical pristine 1080p master file that the Cinejoy TV app receives from Hakuna Matata.
  - Confirmed in Chrome browser testing: loads metadata, full 2:24:38 duration, zero watermarks.
  - Test added: `extracts clean Hakuna Matata stream for Spider-Man on cj-nebula without watermark` in `src/lib/streaming/direct-stream.test.ts`.
- **Validation**:
  - `npm run test`: 19 test files, 212 tests passed (100% pass rate).
  - `npm run lint`: 0 errors.
  - `npm run build`: Compiled successfully in Turbopack (all 41 static/dynamic routes generated).
  - Pushed cleanly to `origin/main`.

## Key locations
- Web repo: `c:/Users/Administrator/Documents/Argus/Argus` (branch: `main`)
- Android TV reference: `c:/Users/Administrator/Documents/Analysis/tv`
- Trusted push backup: `c:/Users/Administrator/Documents/BACKUP/trusted_backup_cinejoy_pipeline_20260926/`
- Pre-pipeline backup: `c:/Users/Administrator/Documents/BACKUP/pre_cinejoy_pipeline_backup/`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
