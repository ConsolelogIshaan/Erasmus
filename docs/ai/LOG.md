# LOG

Append-only. Add new entries at the bottom. Never edit old entries.
Format: `## DATE | Developer | AI` then Changed / Files / Result / Next.

Entries below are condensed from the git history (70 commits, 2026-07-10 to 2026-09-19). AI used is unknown for historical entries.

## 2026-07-10 to 2026-07-13 | Paarth | unknown
- Changed: Project created as Argus (Next.js, TypeScript, Tailwind). Supabase auth, TMDB catalog, dark UI, library progress, system theme, service worker cache-busting, poster fix for Vercel image optimization 402 (unoptimized external images), poster quick actions, translucent UI, Fuse.js fuzzy search, Unlumen sidebar and command menu.
- Commits: 1051ef4, 2209843, 588ed42, f8e6ce3, 1bf27b8, d02078b, f4fc903, 00da9f5

## 2026-08-28 | Paarth | unknown
- Changed: Hardened Supabase auth calls (retry/backoff on token refresh), polished landing page.
- Commit: 03d8713

## 2026-08-28 to 2026-08-30 | Ishaan | unknown
- Changed: Friends/social features, activity feed, public profiles (`/u/[username]`), episode checklist with reversible status, recommendation engine, cast/crew credits and `/person/[id]`, profile validation, Supabase RLS updates, route guards (`src/lib/api/guard.ts`), redirect sanitization. Merged via PRs #1 to #5.
- Commits: 06d9b85 to 2bb2e63

## 2026-08-29 to 2026-08-30 | Paarth | unknown
- Changed: Sidebar refinement, pure dark theme (#0a0a0c), `/privacy` and `/terms` pages, copy polish. Merged via PR #6.
- Commits: 52455cd, 4fdb2fa, c32721e

## 2026-09-11 to 2026-09-12 | Ishaan | unknown
- Changed: In-app playback with resume and silent stream fallback. Replaced iframe embeds with native HLS.js player (`native-player.tsx`). Subtitle proxy route (`/api/stream/subs/file`), Origin header dropped for subtitle list fetch, Stremio subtitle fallback. Player polish: speed menu, scrubbing, first episode picker.
- Commits: 9486c63 to 9e23897

## 2026-09-13 | Ishaan | unknown
- Changed: Repo push tests. Cinematic search redesign, TV resume, Continue Watching integration. Centered cinematic pause overlay. `enrichAudioTracks` forcing English audio default in HLS relay, poster auto-heal, subtitle proxy. TypeScript strict-null fix.
- Commits: 9722a6b, 9c15a0c, e6ad1d4, d75c7c6, 959568e, 3606cb8

## 2026-09-14 | Ishaan | unknown
- Changed: OAuth callback timeout fix, UI scale-up for widescreen/TV, hero banner logo pre-enrichment and preloading.
- Commits: bd5cef3, ac7dc3c, 21f34a7

## 2026-09-15 | Ishaan | unknown
- Changed: Fixed split-cour anime episode scrambling (then generalized to all TV shows), full ASS/SSA to WebVTT converter, public season lists, next-episode support, glassmorphism player with 4K/HD badges, horizontal episode rail with thumbnails, auto-select highest quality. Rebranded Argus to Erasmus (56 files, 98 replacements), new orbit logo and favicons.
- Commits: 319400d to 6058410

## 2026-09-16 | Ishaan | unknown
- Changed: IMDb and Rotten Tomatoes ratings via OMDb, trailer backdrop blending, ambient palette API (`/api/media/ambient-palette`), transparent header, OMDb default fallback key. Lenis smooth scrolling added, then reverted (interfered with horizontal rails and mobile touch scrolling).
- Commits: 9b9459e, 4e3a7e1, 0cd9940, d26a187, 68a2401

## 2026-09-17 | Ishaan | unknown
- Changed: `vidfast-direct.ts` (VidFast direct HLS via enc-dec.app token decryption), TLS bypass for Cinejoy CDN, verbose tracing, 4K detection and Lisbon server badge restored, ABR startup tuning (maxBufferLength 30, maxMaxBufferLength 60), full quality ladder (4K/1080p/720p/480p), companion streams, multi-audio, multi-cour coordinate fallbacks (`getAlternateTvCoordinates`).
- Commits: 081fbc7, 7297ac2, 69aeb77, 19bc503, f80305e, 30d7447

## 2026-09-18 | Ishaan | unknown
- Changed: Platform integrity updates, subtitle stability, player quality badge refinements, media details route error handling.
- Commit: 378319c

## 2026-09-19 | Ishaan | unknown
- Changed: Restored the 6 core streaming files from `BACKUP/stream_fix_backups/` after latency regressions (unauthorized server prioritization, sequential lookups). VidFast primary, Cinejoy secondary.
- Files: cinejoy-stream.ts, direct-stream.ts, native-player.tsx, `/api/stream/hls/route.ts`, streaming-theater-modal.tsx, vidfast-direct.ts
- Commit: 00b98fe

## 2026-09-19 | Paarth | Claude
- Changed: Created shared AI context files (`AGENTS.md`, `docs/ai/STATE.md`, `docs/ai/LOG.md`) from the project dossier. No code changes.
- Next: Get Bingr investigation output and compare against the current Argus/Erasmus stream flow.

## 2026-09-19 | Paarth | Gemini
- Changed: Renamed local branch to `Bingr` and pushed to `origin/Bingr`. Integrated Bingr streaming cluster resolvers (`bingr-stream.ts`) and embed fallback providers (`embed.filmu.in`, Vidy, Cinezo, VidBolt, VidRift). Set Lisbon as the default primary server (`isPrimary: true`). Reordered direct server lineup to place Bingr clusters (Aphelion, Polaris, Bastion, Hallyu, Nova, Edmunds, AnimeSalt, Ryuu) directly below Nebula. Removed redundant center play button overlay from `native-player.tsx`. Hardened HLS relay with CORS headers and `keenanchor.top` direct segment whitelist. Preserved multi-cour Bravo fallback in `vidfast-direct.ts` for continuous split-cour series (e.g. Solo Leveling). Fixed remaining lint/type warnings in `subs/route.ts` and `wyzie.ts`.
- Files: `src/lib/streaming/bingr-stream.ts`, `src/lib/streaming/stream-resolver.ts`, `src/lib/streaming/stream-resolver.test.ts`, `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/servers-modal.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `src/app/api/stream/hls/route.ts`, `src/lib/streaming/vidfast-direct.ts`, `src/lib/streaming/direct-stream.ts`, `src/app/api/stream/subs/route.ts`, `src/lib/streaming/wyzie.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Branch `Bingr` committed (`3f6993c`) and pushed to `origin/Bingr`. `npm run build` passed cleanly (40/40 routes generated), `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), all 42 streaming tests passed.
- Next: Review `Bingr` branch playback on staging and prepare PR to `main`.

## 2026-09-19 | Paarth | Gemini
- Changed: Merged `Bingr` branch into `main` and pushed to `origin/main`. Replaced the centered/padded dialog container in `streaming-theater-modal.tsx` with an edge-to-edge full-viewport browser player (`fixed inset-0 w-screen h-screen rounded-none border-0`), eliminating the empty background backdrop and blurred space behind the player upon clicking Play. Enhanced native and embed player fullscreen handling so clicking the Fullscreen button (or pressing `f`) activates the native OS/browser Fullscreen API (`requestFullscreen()`), toggling the icon between `Maximize2` and `Minimize2`.
- Files: `src/features/streaming/components/streaming-theater-modal.tsx`, `src/features/streaming/components/native-player.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified on `main` branch. `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run build` passed (40/40 routes generated), streaming vitest tests passing.
- Next: Push latest changes to `main` and deploy to production.

