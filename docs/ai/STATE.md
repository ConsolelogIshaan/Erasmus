# STATE

Updated: 2026-09-28 3:09 PM IST
Git: `origin/main` (latest commit `3123594`, pushed to origin/main per explicit user command)

## Priority
Smooth transition optimization for VidFast ↔ Vidlink failover/failback and autonomous relay startup:
1. **Startup Time**: Quick tunnel and relay daemon start in 6 to 8 seconds upon Windows login.
2. **PC-Off Transition (VidFast → Vidlink)**: Seamless and instant (< 1 second) failover to Vidlink without hanging spinners.
3. **PC-On Transition (Vidlink → VidFast 4K)**: Immediate upgrade to VidFast 4K; degraded cache TTL shortened to 10 seconds; playback position seamlessly preserved.

## Architecture Improvements Applied
1. **Autonomous Native Resolver on Port 8443 (`relay/erasmus-relay.mjs`)**:
   - `erasmus-relay.mjs` directly imports `resolveVidfastDirectStream` from `src/lib/streaming/vidfast-direct.ts`.
   - Port 8443 handles `/api/stream/direct` natively over the local residential IP without requiring `npm run dev` or `localhost:3000` to be running.
   - Starts autonomously on Windows boot via `relay/run-silent.vbs` in the Windows Startup folder.
2. **Instant Offline Detection & Fast Failover (`src/lib/streaming/direct-stream.ts`)**:
   - Reads `TARGET_URL` and `LAST_PING` from KV in parallel.
   - If `Date.now() - lastPing >= 90_000` (heartbeat sent every 25s), the bridge is flagged offline and skipped in **0ms**, falling straight back to Vidlink with zero delay.
   - Adjusted bridge resolution fetch timeout to 7000ms so VidFast 4K has ample time to resolve while avoiding infinite hangs.
3. **Short-Lived Degraded Cache for Instant Upgrade (`src/lib/streaming/direct-stream.ts`)**:
   - When Lisbon falls back to a non-4K stream (Vidlink) because the PC was off, cache TTL is capped at **10 seconds** instead of 3 minutes.
   - As soon as the PC boots, the very next request instantly discovers the online tunnel and loads authentic 4K VidFast.
4. **Playback Position Preservation (`src/features/streaming/components/streaming-theater-modal.tsx`)**:
   - `handleSelectServer` and `handleReload` now preserve `lastKnownRef.current.seconds` into `startAt`.
   - Switching between servers (or upgrading to 4K Lisbon) resumes playback at the exact second without restarting.
5. **Heartbeat Frequency & Worker Expiry Tuning (`relay/sync-tunnel-url.mjs`, `relay/cloudflare-worker/worker.js`)**:
   - `sync-tunnel-url.mjs` sends heartbeats every 25s (was 60s).
   - `worker.js` reduced `HEARTBEAT_EXPIRY_MS` from 15 minutes to 90 seconds.

## Verification Summary
- **Live Endpoint Test**:
  - `fetch("https://erasmus-web.erasmustv.workers.dev/api/stream/direct?id=385128&type=movie&server=lisbon")`:
  - Returned: `vRapid` (`moon.quietridge.top/vd/.../master.m3u8`), `is4K: true`, `fourKUrl: master.m3u8` in 6.6s.
- **Relay Native Resolution Test**:
  - `http://localhost:8443/api/stream/direct?id=385128&type=movie&server=lisbon`:
  - Returned: `vRapid`, `is4K: true` in 4.0s (independent of port 3000).
- **Quality Gates**:
  - `npm run lint`: 0 errors.
  - `npm run build`: 0 errors (all routes generated).
  - `npx @opennextjs/cloudflare build`: clean build.
  - `npx wrangler deploy`: deployed cleanly (Version ID: `8bcb269c-dad3-4afa-94b5-981c9a787ab1`).
  - `relay/cloudflare-worker/wrangler.toml deploy`: deployed cleanly (Version ID: `1014f368-3ccc-4197-8f40-1dce0f867f75`).
