# STATE

Updated: 2026-09-27 9:28 PM IST
Git: `origin/main` (Clean working tree; verified build, lints, and tests; streaming buffering & stuttering fixed)

## Priority
Streaming/playback is stable and rock-solid. Fixed the buffering and stuttering issues reported by the user in `NativePlayer` and deployed the updated Smart Relay worker to Cloudflare.

## Buffering & Stuttering Fixes Applied
1. **Eliminated Hls.js 3-Second Watchdog Stutter Loop**:
   - Reverted `highBufferWatchdogPeriod: 3` and `nudgeOffset: 0.3` back to stable defaults (`highBufferWatchdogPeriod: 8`, `nudgeOffset: 0.2`, `nudgeMaxRetry: 5`).
   - Root Cause: Setting `highBufferWatchdogPeriod: 3` caused HLS.js to violently skip the playhead forward by 0.3s every 3 seconds whenever any buffer underrun occurred, causing rapid play-pause-skip jitter.

2. **Removed Forged 18 Mbps Bitrate Bias & Bandwidth Testing**:
   - Removed `abrEwmaDefaultEstimate: 18_000_000` and `testBandwidth: true`.
   - Root Cause: Forcing an initial 18 Mbps estimate caused HLS.js to immediately jump straight into the highest 16.2 Mbps 4K stream on initial frame load, starving the buffer on typical residential internet connections. Removed `testBandwidth: true` to prevent continuous test-fetching and quality level flapping.

3. **Restored Balanced Buffer Headroom & Max Hole Clearance**:
   - Restored `maxBufferLength: 60`, `maxMaxBufferLength: 120`, `maxBufferSize: 120 * 1000 * 1000`, and `maxBufferHole: 0.8`.
   - Root Cause: Attempting to buffer 250 MB (180s) ahead with a 1.5s hole tolerance requested too many concurrent fragments and allowed container PTS discontinuities.

4. **Fixed Stuck Loading Spinner in `FRAG_BUFFERED`**:
   - Removed `if (!video.paused)` guard from `Hls.Events.FRAG_BUFFERED`. The buffering spinner now clears unconditionally whenever fresh media frames arrive, eliminating the permanent spinner trap shown in the user's screenshots.

5. **Cloudflare Smart Relay Deployment**:
   - Added `Origin` header handling alongside `Referer` to `relay/cloudflare-worker/worker.js` for upstream CDN compatibility.
   - Deployed to `https://erasmus-hls-relay.erasmustv.workers.dev` (Version ID: `bc187618-abdf-4779-a9f6-d5421193a16d`).
   - Fixed `PRIMARY_WORKER_URL` in `relay/sync-tunnel-url.mjs` to point to `erasmustv.workers.dev` so background scripts never revert `.env.local` to the slow residential tunnel.

---

## Verification Summary
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors.
- `npm run test`: 20/20 test files passed (223/223 tests passed, 100% pass rate).
- `npm run build`: 52/52 routes compiled cleanly.
- Worker deployed: `erasmus-hls-relay.erasmustv.workers.dev` (Version `bc187618-abdf-4779-a9f6-d5421193a16d`).
- Strictly 0 git push without explicit user instruction per `AGENTS.md`.
