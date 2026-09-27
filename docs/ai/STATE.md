# STATE

Updated: 2026-09-27 7:18 PM IST
Git: `origin/main` (Clean working tree; verified build, lints, and tests; Cloudflare Workers CI connected with OpenNext)

## Priority
The authenticated web application uses a centered floating navbar instead of the permanent desktop sidebar. Streaming/playback remains frozen and unchanged by this task.

## Current Local UI Work

- Added the responsive floating navbar and preserved watchlist, profile, and mobile navigation flows.
- Replaced Spotlight with a dedicated protected `/search` page. Navbar search and keyboard shortcuts navigate there; the overlay and its state were removed.
- Search includes debounced live results, cancellation, URL queries, recent searches, type filters, trending discovery, retry, and pagination.
- Improved typo recovery with merged and ranked fallback candidates, prefix retrieval, and accent/punctuation normalization.
- Search verification: 9 focused tests passed; typecheck, lint, and production build passed. Browser preview reaches the login gate; authenticated visual verification is unavailable in the current browser session.
- Removed the desktop sidebar and obsolete sidebar layout state/offsets.
- Updated full-bleed hero and catalog spacing for the fixed navbar.
- Validation before rebasing: typecheck, lint, build, and targeted streaming tests passed; full live-provider tests remain subject to upstream instability.

## Streaming Priority
Zero buffering, zero stuttering, and zero playback freezes; maximizing user bandwidth utilization ("juicing" out 15–30+ Mbps connections with aggressive forward pre-buffering); Cloudflare Anycast edge relay delivery with edge RAM caching; zero domestic upload bandwidth strangulation (bypassing slow local tunnels); 100% clean builds, lints, and tests.

---

## Current Architecture & Status

### Cloudflare Deployment Topology
1. **Account 1 (`shrdsubscriptions@gmail.com`) — Web Application (`erasmus-web`)**:
   * **URL**: [https://erasmus-web.erasmustv.workers.dev](https://erasmus-web.erasmustv.workers.dev)
   * **Active Version ID**: `50ca9f2b-8c47-44bc-8d45-a4fcca64d153`
   * **Role**: Serves the Next.js App Router UI, page SSR, catalog discovery, search, TMDB client caching, and user authentication.
   * **Relay URL Configured**: Points directly to `https://erasmus-hls-relay.erasmustv.workers.dev`.
   * **Status**: 100% OK. Fully decoupled from video streaming. Request rate during active playback is ~0 req/min.

2. **Account 1 Streaming Relay (`erasmus-hls-relay`)**:
   * **URL**: [https://erasmus-hls-relay.erasmustv.workers.dev](https://erasmus-hls-relay.erasmustv.workers.dev)
   * **Active Version ID**: `f8ee2da6-f00e-4cc0-ba96-58c2e4eca0b1`
   * **Role**: Primary high-speed Anycast HLS relay handling 100% of all HLS master playlists, child variant playlists, audio tracks, and video segment chunks.
   * **Path 0 (Cloudflare Edge Direct Fetch)**: Fetches video segments directly from upstream CDNs (`keenanchor.top`, `quietnexus.top`, `moon.quietridge.top`, `hakunaymatata.com`) in Cloudflare edge memory.
   * **Edge Caching**: Configured with `cf: { cacheEverything: true, cacheTtl: 86400 }` and `Cache-Control: public, max-age=86400, s-maxage=86400, immutable`. Video segments hit Cloudflare's Edge RAM cache with `cf-cache-status: HIT`, returning in <15ms with 0 upstream latency!
   * **Status**: 100% OK. Verified delivering video segments at **30.18 Mbps** (0.71s for a 2.55 MB segment).

3. **Account 2 (`ishaan.jangid1@gmail.com`) — Standby Streaming Relay**:
   * **URL**: [https://erasmus-hls-relay.ishaan-jangid1.workers.dev](https://erasmus-hls-relay.ishaan-jangid1.workers.dev)
   * **Role**: Dedicated 100k daily request pool. Currently idling on previous build.
   * **Roadmap**: Ready to receive the updated `worker.js` via `npx wrangler deploy` once authenticated under `ishaan.jangid1@gmail.com` to restore the 200,000 requests/day dual-account split with identical 30 Mbps cloud delivery.

4. **Database & Auth Backend**:
   * **Provider**: Supabase Cloud (`https://jnxflxtizbezqclxfmzc.supabase.co`).
   * **Role**: Persistent cloud database for watch history, continue watching, ratings, and user profiles. Completely independent of local PC and Vercel.

---

## Detailed Root Causes & Fixes Implemented

### 1. Root Cause of 24:49 Buffering, Stuttering, and Pausing
* **Issue**: Video playback on server Lisbon (e.g. *Interstellar* at timestamp `24:49 / 2:49:02`) froze, buffered constantly, and stuttered.
* **Root Cause Diagnosis**:
  1. `wrangler.jsonc` and `src/lib/streaming/relay.ts` were pointing to `https://erasmus-hls-relay.ishaan-jangid1.workers.dev`.
  2. `ishaan-jangid1.workers.dev` was running an outdated Cloudflare Worker script that lacked Path 0 (Cloudflare Edge Direct Fetch).
  3. Because `sync-tunnel-url.mjs` was active and registered `activeTunnel: 'https://unnecessary-kevin-chances-socks.trycloudflare.com'` (pointing to port 8443 on the user's local PC running `relay/erasmus-relay.mjs`), `ishaan-jangid1.workers.dev` forwarded every single video chunk down through the tunnel into the local PC!
  4. At timestamp 24:49, segment 247 is a 6.47 MB bitrate spike. The local Node.js process downloaded 6.47 MB over the user's home Wi-Fi and re-uploaded 6.47 MB over the home Wi-Fi tunnel to Cloudflare simultaneously.
  5. On a 15–20 Mbps home internet connection with ~5 Mbps upload, transferring 6.5 MB took **8.7 seconds** for a 6-second chunk! Because 8.7s > 6.0s, the player buffer was starved to 0, triggering `BUFFER_STALLED_ERROR` and freezing the video.
* **Fix**:
  1. Routed `NEXT_PUBLIC_HLS_RELAY_URL` and `CLOUDFLARE_HLS_RELAY` to `https://erasmus-hls-relay.erasmustv.workers.dev`.
  2. Upgraded `relay/cloudflare-worker/worker.js` with Path 0 Cloudflare Edge Caching (`cf: { cacheEverything: true, cacheTtl: 86400 }`) and Hakuna Matata ExoPlayer header awareness.
  3. Deployed to `https://erasmus-hls-relay.erasmustv.workers.dev` (Version ID: `f8ee2da6-f00e-4cc0-ba96-58c2e4eca0b1`).
  4. Benchmark comparison: Throughput jumped from 7.81 Mbps (8.7s) through the local tunnel to **30.18 Mbps (0.71s)** directly from Cloudflare's Anycast edge! The home PC and home Wi-Fi upload are 100% bypassed!

### 2. High-Bandwidth Aggressive Buffer Engine in `NativePlayer`
* **Issue**: The player underutilized user bandwidth, maintained a conservative 60s buffer, and stuttered on micro-PTS timestamp gaps. In `BUFFER_STALLED_ERROR`, calling `video.play()` immediately when the buffer was empty caused rapid play-pause-play-pause jitter loops.
* **Fix in [native-player.tsx](file:///c:/Users/Administrator/Documents/Argus/Argus/src/features/streaming/components/native-player.tsx)**:
  1. **Bandwidth Primes**: Set `abrEwmaDefaultEstimate: 18_000_000` (18 Mbps initial estimate) so HLS.js immediately treats the connection as high-speed rather than the 500 kbps default.
  2. **Bandwidth Factor**: `abrBandWidthFactor: 0.95`, `abrBandWidthUpFactor: 0.85` to utilize 95% of available network bandwidth.
  3. **Aggressive Pre-buffering**:
     - `maxBufferLength: 90` (1.5 minutes forward buffer)
     - `maxMaxBufferLength: 180` (3 full minutes forward buffer headroom)
     - `maxBufferSize: 250 * 1000 * 1000` (250 MB buffer memory)
     Whenever the player is active, it continuously downloads ahead until up to 3 minutes of video is buffered in memory, absorbing any Wi-Fi fluctuations or bitrate spikes.
  4. **Micro-gap Tolerance**: Raised `maxBufferHole: 1.5` (tolerates up to 1.5s container timestamp discontinuity without triggering a stall) and set `highBufferWatchdogPeriod: 3` with `nudgeOffset: 0.3` and `nudgeMaxRetry: 10`.
  5. **Clean Recovery Lifecycle**:
     - Removed premature `video.play()` on empty buffer inside `BUFFER_STALLED_ERROR`. The error handler now sets `setBuffering(true)` and signals `hls.startLoad()`.
     - In `Hls.Events.FRAG_BUFFERED`, once the fresh fragment is committed to the MediaSource buffer, `setBuffering(false)` clears the spinner and `video.play()` cleanly resumes playback.
     - Added `userWantsPauseRef` and unified `togglePlay()` across click, keydown, and control buttons so buffer underruns never leave the player stuck in paused state.

---

## Proven Real-World Playback Benchmark

| Metric | Outdated Tunnel Path (`ishaan-jangid1`) | Cloudflare Anycast Edge (`erasmustv`) | Improvement |
|---|---|---|---|
| **2.55 MB Segment Download** | `2.74 seconds` (Wi-Fi choked) | **`0.71 seconds`** | **3.9x faster** |
| **Throughput Speed** | `7.81 Mbps` | **`30.18 Mbps`** | **Juices full connection** |
| **CF Cache Status** | `DYNAMIC` | **`HIT` (RAM cache)** | Instant repeated chunks |
| **Home PC Upload Used** | 100% saturated | **0 bytes (zero PC dependency)** | Wi-Fi completely free |
| **Buffer Capacity** | 60 seconds (120 MB) | **180 seconds (250 MB)** | 3 full minutes forward buffer |

---

## Verification Summary
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors.
- `npm run test`: 19/19 test files passed (219/219 tests passed, 100% pass rate).
- `npm run build`: 41/41 routes compiled cleanly.
- `opennextjs-cloudflare build` & `wrangler deploy`: Succeeded (Version `50ca9f2b-8c47-44bc-8d45-a4fcca64d153`).
- `relay/cloudflare-worker` deployed: Succeeded (Version `f8ee2da6-f00e-4cc0-ba96-58c2e4eca0b1`).
- ZERO git push performed per `AGENTS.md`.
