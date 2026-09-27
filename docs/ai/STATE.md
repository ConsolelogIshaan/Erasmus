# STATE

Updated: 2026-09-27 9:42 PM IST
Git: `origin/main` (Clean working tree; verified build, lints, and tests; high-bandwidth buffering & low-latency streaming optimized)

## Priority
Streaming/playback is stable, fast, and buffered ahead. Optimized `NativePlayer` to maximize user bandwidth ("juice internet") with high forward buffer headroom, 95% ABR bandwidth utilization, real bitrate estimation, and throttled playback progress persistence to eliminate UI thread frame-drops.

## Buffering & Bandwidth Optimizations Applied
1. **Aggressive Forward Buffer Headroom (Zero Buffering)**:
   - `maxBufferLength: 120` (2 minutes forward buffer).
   - `maxMaxBufferLength: 240` (up to 4 minutes forward buffer headroom when bandwidth allows).
   - `maxBufferSize: 180 * 1000 * 1000` (180 MB MSE buffer ceiling to accommodate high-bitrate 1080p and 4K streams).
   - `backBufferLength: 60` (60 seconds back-buffer for instant, zero-rebuffer rewinds).

2. **Responsive Adaptive Bitrate (Max Quality)**:
   - `abrBandWidthFactor: 0.95`: Utilizes 95% of measured bandwidth to consistently target highest resolution tiers.
   - `abrBandWidthUpFactor: 0.75`: Smooth and responsive quality step-ups without waiting for double bandwidth overhead.
   - `abrMaxWithRealBitrate: true`: Measures actual downloaded segment throughput rather than theoretical manifest values, detecting high-speed connections immediately.
   - Smart Start Level: Prefers 1080p for instant high-def playback startup, falling back to 720p or highest available stream.

3. **Stutter-Free Watchdog Stability**:
   - `highBufferWatchdogPeriod: 8` and `nudgeOffset: 0.1`: Gentle 100ms nudge only on genuine decoder stalls, completely immune to the 3-second rapid skip jitter loop.
   - `maxBufferHole: 0.8`: Tight timestamp gap clearance.
   - `fragLoadingTimeOut: 25000` with 6 retries and 500ms delay.

4. **Throttled LocalStorage Sync During Playback**:
   - In `streaming-theater-modal.tsx`, throttled `savePlaybackProgress` from firing 4x/sec (every 250ms `timeupdate`) down to once every 1500ms.
   - Guaranteed full final position sync on modal close / pause. Eliminates main-thread JSON serialization spikes during video playback.

---

## Verification Summary
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors (11 pre-existing warnings).
- `npm run test`: All 20 test files passed (223/223 tests passed, 100% pass rate).
- `npm run build`: 52/52 routes compiled cleanly.
- Worker deployed: `erasmus-hls-relay.erasmustv.workers.dev` (Version `bc187618-abdf-4779-a9f6-d5421193a16d`).
- Strictly 0 git push without explicit user instruction per `AGENTS.md`.
