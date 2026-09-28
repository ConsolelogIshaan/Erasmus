# AGENTS.md

Instructions for every AI tool working in this repo (Codex, Cursor, Copilot, Claude, Gemini, etc.).
Tools that need their own filename (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`) should contain only: `See AGENTS.md`.

## Project
- **Erasmus** (originally **Argus**, renamed 2026-09-15): web streaming/tracking app. Next.js 16 (Turbopack), React 19, TypeScript, Tailwind, Supabase, TMDB + OMDb.
- **Cinejoy**: Android TV / Google TV app (`to.cinejoy.tv`, Java/Gradle, WebView + D-pad navigation). Separate workspace; also referred to as "Erasmus TV".
- Both use the same Supabase backend. Long-term goal: shared profiles, watch history, watchlists, and provider/source changes.
- Two developers: Paarth Sharma and Ishaan Jangid. Each uses different AI tools, so all shared context lives in this repo.

## Current priority
Streaming/playback is currently frozen and stable. Do NOT work on or modify streaming/playback (src/lib/streaming/*, src/app/api/stream/*, src/features/streaming/*) unless explicitly instructed by the user. Do not risk working playback.

## Streaming architecture (summary)
- Resolver: `src/lib/streaming/direct-stream.ts` dispatches VidFast Direct (primary, `vidfast-direct.ts`) then Cinejoy/Shegu (secondary, `cinejoy-stream.ts`). Subtitles: `subtitles.ts` (Stremio fallback, ASS/SSA to WebVTT).
- Flow: `/api/stream/direct` → `/api/stream/hls` (relay proxy) → upstream CDN.
- Player: `src/features/streaming/components/native-player.tsx` (HLS.js).
- Known problem: full video traffic passes through Vercel via `/api/stream/hls`. Goal is direct media playback where technically possible, proxying only when necessary. Details in `docs/ai/ARCHITECTURE.md` if present.

## Rules

### Always
- Absolute honesty and transparency with the user at all times: NEVER misrepresent, sugarcoat, disguise, or falsely claim an architecture is running somewhere it isn't (e.g., claiming a service is "100% cloud/Cloudflare native" when it secretly depends on a local machine, or claiming Vercel is eliminated when secret server-to-server fallback calls to Vercel still exist). Clearly explain the exact path of all data, what runs where, and what each component is doing. Deceiving or clickbaiting the user is strictly forbidden.
- Verify end-to-end on live deployment: Never assume a local curl or build success means production works. Test the live deployed URL directly, inspect the actual stream provider/URL and manifest resolution (e.g. 3840x2160 for 4K), and ensure silent fallbacks did not mask an edge failure behind an HTTP 200.
- Keep Erasmus's own player/UI.
- Run `npm run build` and `npm run lint` before finishing any code change.
- Keep the verified streaming files working. Backups are in `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`.
- Update `docs/ai/STATE.md` and append to `docs/ai/LOG.md` before finishing.

### Ask first
- Any change to Supabase schema, `watch_profiles`, or profile/backend logic. An earlier profile integration broke playback and was reverted.
- Changing provider order or server prioritization (VidFast primary, Cinejoy secondary). An earlier unapproved change caused latency regressions.
- Changes to `/api/stream/hls`, `/api/stream/direct`, `vidfast-direct.ts`, `cinejoy-stream.ts`, `direct-stream.ts`, `native-player.tsx`, or `streaming-theater-modal.tsx`.
- Adding paid services or new dependencies (project goal: zero paid infrastructure).
- Pushing to remote (`git push`). Always ask first and wait for explicit confirmation.

### Never
- Mislead, disguise, or deceive the user about architecture, data paths, or hosting: Never claim a solution is "100% in the cloud" if a local PC, residential IP, or bridge is secretly required. Never claim a service (like Vercel) has been removed if background calls to it remain. Always state the exact technical truth, including limitations and dependencies.
- Assume local curl or HTTP 200 proves production works: Never declare streaming fixed without checking the actual stream URL, provider, and resolution tiers on the deployed site.
- Work on or modify streaming/playback unless explicitly instructed by the user.
- Push to git remote (`git push`) under ANY circumstances unless the user explicitly and directly commands you to push. All work, commits, tests, lints, and builds must remain strictly local until explicit user instruction is given.
- Add iframe embeds (ad/redirect behavior).
- Commit secrets or `.env` files.
- Force-push or rewrite shared history.

## Session workflow
1. Read `docs/ai/STATE.md` and the last 10 entries of `docs/ai/LOG.md`.
2. Work on a branch per task where possible.
3. Finish: update `docs/ai/STATE.md` (overwrite), append an entry to `docs/ai/LOG.md`

## Key docs
- `docs/ai/STATE.md`: current status (overwritten each session)
- `docs/ai/LOG.md`: append-only history
