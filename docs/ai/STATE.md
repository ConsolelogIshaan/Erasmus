# STATE

Updated: 2026-09-28 2:10 PM IST
Git: `local` (changes verified with linter and production builds; strictly NO git push without explicit user command)

## Priority
4K stream restoration for Lisbon (VidFast) on Cloudflare Workers edge (`erasmus-web.erasmustv.workers.dev`): fully resolved, tested, and deployed.
Zero Vercel involvement (0 MB on Vercel). Sub-second residential bridge connection over Reliance Jio.

## Root Cause of Missing 4K (Fast & Furious 9 / TMDB 385128)
1. **Cloudflare Error 1042 on Worker Subrequests**:
   - `erasmus-web` and `erasmus-hls-relay` both run on `erasmustv.workers.dev`.
   - Cloudflare edge proxy strictly forbids one Worker from making a plain HTTP `fetch()` to another Worker on the same `workers.dev` subdomain (Error 1042: subrequest loop prevention).
   - This HTTP call returned `404 (error code: 1042)`, causing the app to silently fall back to Bingr / Vidlink (`img.rousav.tech`), which only provides 720p HD and lower.
   - The HLS.js player parsed that 720p manifest, found 0 4K or 1080p levels, and consequently hid the 4K and 1080p buttons from the player Quality menu.
2. **Missing `vRapid` / `/vd/` in `is4K` Evaluator**:
   - VidFast's primary server `vRapid` delivers a multi-variant adaptive master playlist (`moon.quietridge.top/vd/.../master.m3u8`) containing 3840x2160, 1920x1080, 1280x720, and 852x480.
   - Because the URL ended in `master.m3u8` and didn't contain `"2160"` or `"4k"` in the string, `is4K` was incorrectly evaluated to `false`.

## Architecture Fixes Applied
1. **Cloudflare Service Binding & Direct KV Target Resolution (`src/lib/streaming/direct-stream.ts`)**:
   - Added `HLS_RELAY` service binding (`erasmus-hls-relay`) and `RELAY_CONFIG` KV namespace (`1b9f4e2fbdc74d6d943c64a37e9d0120`) to `wrangler.jsonc`.
   - Strategy A1 reads `TARGET_URL` directly from edge KV and fetches the active Quick Tunnel URL (`trycloudflare.com`) directly from Cloudflare, completely bypassing Error 1042.
   - Strategy A2 invokes `HLS_RELAY.fetch()` directly in-memory via Service Binding if needed.
2. **Multi-Variant 4K Recognition (`src/lib/streaming/vidfast-direct.ts`)**:
   - Added `candidate.name.toLowerCase() === "vrapid" || finalUrl.includes("/vd/")` so multi-variant master playlists containing 3840x2160 are immediately flagged with `is4K: true` and `fourKUrl: masterUrl`.
3. **Environment & Sync Alignment**:
   - Aligned `PRIMARY_WORKER_URL` in `relay/sync-tunnel-url.mjs` and `NEXT_PUBLIC_HLS_RELAY_URL` in `.env.local` to `https://erasmus-hls-relay.erasmustv.workers.dev`.
4. **Edge Deployment**:
   - Rebuilt with OpenNext and deployed to `https://erasmus-web.erasmustv.workers.dev` (Version ID: `a6d66f78-a21d-4bae-b0ed-400c041b28ca`).

## Verification Summary
- **Live Endpoint Test**:
  - `curl "https://erasmus-web.erasmustv.workers.dev/api/stream/direct?id=385128&type=movie&server=lisbon"`:
  - Returned: `vRapid` (`moon.quietridge.top/vd/.../master.m3u8`), `is4K: true`, `fourKUrl: master.m3u8`, `ms: 3045`.
  - Master playlist confirmed to contain `#EXT-X-STREAM-INF:BANDWIDTH=16223809,RESOLUTION=3840x2160`.
- **Quality Gates**:
  - `npm run lint`: 0 errors.
  - `npm run build`: 0 errors (all routes generated).
  - `npx opennextjs-cloudflare build`: clean build.
  - `npx wrangler deploy`: deployed cleanly.
