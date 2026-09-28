# STATE

Updated: 2026-09-28 10:35 PM IST
Git: `origin/main` (local: modified `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `src/lib/streaming/vidfast-direct.ts`, `src/lib/streaming/direct-stream.ts`, `next.config.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`, `AGENTS.md`)

## Priority
Platform-Wide 4K Quality Tier Integrity, Off Campus Investigation, and Lisbon Quality Upgrades:

1. **Forensic Analysis of *Off Campus* (TMDB `273240`)**:
   - **Season 2 Status**: On TMDB and across all streaming CDN partners, *Off Campus* only consists of Season 1 (8 episodes released in 2026). Season 2 does not exist anywhere in the world yet. VidFast nodes return HTTP 404 for Season 2.
   - **Season 1 Upstream Reality**:
     - **Episodes 1, 3, 5**: VidFast upstream servers `vRapid` and `vBlaze` provide true 4K master playlists (`master.m3u8` containing Level 3: 3840x1920 SDR 4K @ 15.3 Mbps).
     - **Episodes 2, 4, 6, 7, 8**: VidFast's 4K servers (`vRapid` and `vBlaze`) return HTTP 404. VidFast only had Server Cobra (a single-bitrate 720p stream).
   - **Root Cause of "Used to Have 4K on Episode 2"**:
     - `getAlternateTvCoordinates` in `vidfast-direct.ts` previously had blind offsets: `add(season, episode - 1, "episode-minus-1")` and `add(1, episode, "s1-same-episode")`.
     - When Episode 2 404'd on vRapid, the code silently fell back to Episode 1, playing Episode 1's 4K file while labeled as Episode 2!
     - When that was fixed to prevent playing the wrong episode, Episode 2 resolved to Cobra, revealing that VidFast only has 720p for Episode 2.

2. **Resolutions Implemented Platform-Wide**:
   - **Eliminated Blind Wrong-Episode Fallbacks**:
     - Removed `episode-minus-1`, `episode-plus-1`, `season-minus-1`, and `s1-same-episode` from `getAlternateTvCoordinates`. Anime absolute cour splits are preserved, but blind previous-episode replays are permanently eliminated.
   - **Lisbon Quality Floor & 1080p Upgrades**:
     - In `src/lib/streaming/direct-stream.ts`: When VidFast on Lisbon only provides a sub-1080p fallback (e.g. 720p Cobra or Horizon), the resolver checks if Vidlink provides a pristine 1080p Full HD stream (Hakuna Matata CDN MP4 / H.265).
     - Result: Episodes 2, 4, 6, 7, 8 automatically upgrade to pristine 1080p Full HD rather than stranding the user on 720p. Episodes 1, 3, 5 remain in authentic 4K.
   - **Server Candidate Ordering**:
     - In `src/lib/streaming/vidfast-direct.ts`, updated `fourKOrder` on Lisbon/Athens to prioritize `["vRapid", "vBlaze", "vFast", "vEdge", "Cine", "Bravo", "Cobra", "Horizon"]`, ensuring high-bitrate and 4K/1080p servers are always tried before lower-tier servers.
   - **Robust 4K Detection & Player Locking**:
     - Updated `is4K` detection in `vidfast-direct.ts` to inspect `vblaze`, `streamResult["4kAvailable"] === true`, and `/vdb/`.
     - In `streaming-theater-modal.tsx`: Defaulted `primarySrc` directly to `resolvedFourK` when available.
     - In `native-player.tsx`: Initialized `activeSrc` to `fourKSrc`, initialized `selectedQualityTier` to `"4k"`, and locked `hls.currentLevel` to the 4K level immediately on manifest parse.

3. **End-to-End Verification & Quality Gates**:
   - **Puppeteer Chrome Browser Verification (`scratch/verify-playback-browser.mjs`)**:
     - **Test 1 (Off Campus S1E1 4K)**: Hls.js loaded `master.m3u8` from relay and parsed index 3 (3840x1920 Univisium 4K @ 15.3 Mbps). PASS.
     - **Test 2 (Off Campus S1E2 1080p)**: HTML5 `<video>` loaded 1920x960 1080p Full HD metadata with duration 3025.79s (matching the 50:25 runtime). PASS.
   - **4K Movies Tested**: *Dune: Part Two* (4K PASS), *Interstellar* (4K PASS), *Deadpool & Wolverine* (4K PASS).
   - **Tests**: `npm test` passed 224/224 tests across 20 test files.
   - **Lints**: `npm run lint` passed with 0 errors (14 warnings).
   - **Build**: `npm run build` compiled all 41 routes successfully with code 0.
   - **Remote Safety**: Zero `git push` or remote deploy executed.
