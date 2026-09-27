# STATE

Updated: 2026-09-27 9:51 PM IST
Git: `origin/main` (All source code restored to pre-1102 baseline commit `016aedf`; verified typecheck, lint, and tests)

## Priority
Streaming/playback restored to the exact known-good working state from commit `016aedf` (before the recent Error 1102 optimizations and buffer experiments), per the user's explicit request.

## Current State
- All codebase files in `src/`, `relay/`, and `package.json` are byte-for-byte restored to `016aedf`.
- HLS relay restored to Account 2 (`https://erasmus-hls-relay.ishaan-jangid1.workers.dev`).
- `NativePlayer` restored to its original pre-1102 configuration:
  - `abrEwmaDefaultEstimate: 18_000_000`
  - `abrBandWidthFactor: 0.95`
  - `abrBandWidthUpFactor: 0.85`
  - `maxBufferLength: 90`
  - `maxMaxBufferLength: 180`
  - `maxBufferSize: 250 * 1000 * 1000`
  - `maxBufferHole: 1.5`
  - `highBufferWatchdogPeriod: 3`
  - `nudgeOffset: 0.3`
  - `nudgeMaxRetry: 10`
  - `testBandwidth: true`
- All Error 1102 modifications made in `43a4c48`, `4bfb6a2`, and `62070e8` have been reverted.

---

## Verification Summary
- `git diff 016aedf src relay package.json`: 0 diff lines (exact match).
- Pushed to `origin/main` per explicit user command.
