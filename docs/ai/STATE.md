# STATE

Updated: 2026-09-28 11:05 PM IST
Git: `origin/main` (local: modified `relay/cloudflare-worker/worker.js`, `relay/sync-tunnel-url.mjs`, `src/lib/streaming/direct-stream.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`)

## Priority
Cloudflare Deployment & Streaming Pipeline Hardening:

1. **Root Cause Analysis of Post-Deploy Failure on Cloudflare (`erasmus-web.erasmustv.workers.dev`)**:
   - **Cloudflare KV Write Quota Exhaustion (Error 10048)**:
     - `sync-tunnel-url.mjs` was sending heartbeat `/ping` requests every 10 seconds.
     - On the Cloudflare Worker, `/ping` was calling `env.RELAY_CONFIG.put("LAST_PING")` to KV on every ping (6 writes/min = 360 writes/hr = 8,640 writes/day).
     - Cloudflare KV free tier limits accounts to 1,000 writes/day. The quota was exhausted earlier today.
     - Once exhausted, KV PUT operations threw `10048 (free usage limit reached for today)`, preventing any updates to `TARGET_URL` or `LAST_PING`.
   - **Fragile Heartbeat Timeout in `direct-stream.ts` and `worker.js`**:
     - Both `direct-stream.ts` on `erasmus-web` and `worker.js` on `erasmus-hls-relay` checked `Date.now() - lastPing < 45_000` (or `90_000`).
     - Because `LAST_PING` in KV was frozen from hours ago, both services assumed the local residential bridge was dead.
     - The web app skipped the bridge and fell back to Vidlink / Hakuna Matata CDN (`bcdn.hakunaymatata.com`).
     - The relay worker skipped the residential tunnel and attempted direct Cloudflare Edge fetch.
     - Cloudflare Edge fetch got HTTP 403 Forbidden from VidFast (`moon.quietridge.top`) and HTTP 427 Precondition Required from Hakuna Matata.
     - The browser received 403/427 on video chunk and manifest requests, displaying `"Stream unavailable on Lisbon. Please try another server."` with `0:00` duration.
   - **Undefined Variable Bug in `worker.js`**:
     - Line 321 had `targetHost.endsWith(".top")` where `targetHost` was not defined, causing a ReferenceError before stream evaluation.
   - **Premature 5s Timeout on Direct Resolver**:
     - In `worker.js`, `/api/stream/direct` aborted at 5,000ms. On complex multi-server cascades (like Off Campus S1E4), upstream queries take 6-7 seconds, causing false "residential bridge offline" errors.

2. **Resolutions Implemented & Deployed**:
   - **Cloudflare Relay Worker (`relay/cloudflare-worker/worker.js`)**:
     - Fixed `targetHost = target.hostname.toLowerCase()`.
     - Completely eliminated KV writes on `/ping`. Heartbeats update in-memory cache with zero KV write quota consumption.
     - Made tunnel forwarding stateless and reliable: Path 1 always routes through the active tunnel when available with a 5s/18s timeout. If the tunnel fails or times out, it gracefully falls through to edge fetch.
     - Increased `/api/stream/direct` resolver timeout to 12,000ms.
     - Set default fallback tunnel URL to active tunnel `https://nurse-autumn-browser-rpg.trycloudflare.com`.
     - Deployed live via Wrangler: `https://erasmus-hls-relay.erasmustv.workers.dev` (Version ID: `f494fa22-2752-4439-9b3c-95ac173add80`).
   - **Direct Stream Resolver (`src/lib/streaming/direct-stream.ts`)**:
     - Removed fragile `Date.now() - lastPing < 45_000` lockout. Strategies A1, A2, and B now query the bridge directly with 4.5s timeouts without failing on stale KV ping timestamps.
   - **Sync Script (`relay/sync-tunnel-url.mjs`)**:
     - Added `AbortSignal.timeout(5000)` to all fetch operations to prevent socket hanging.

3. **End-to-End Verification**:
   - **Live Worker Streaming**:
     - Breaking Bad S01E01: Resolved `vRapid` (4K: true), relay manifest HTTP 200 OK (`3840x2160`).
     - Off Campus S01E04: Resolved `Cobra` (HTTP 200 OK manifest from relay).
     - Spider-Man: Across the Spider-Verse: Resolved `vRapid` (4K: true), relay manifest HTTP 200 OK.
   - **Unit Tests**: `npm test` passed 224/224 tests across 20 test files.
   - **Lints**: `npm run lint` passed with 0 errors (14 warnings).
   - **Build**: `npm run build` compiled all 41 routes cleanly with code 0.
