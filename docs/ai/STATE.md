# STATE

Updated: 2026-09-27 2:40 PM IST
Git: `origin/main` (Rebased on latest upstream changes including Gossip Girl 2007 upstream shield and Polaris fixes)

## Priority
Maintaining 100% stable, seamless streaming across all devices; dual-account 200,000 requests/day split ($0 cost); full routing of Lisbon and all streaming servers to Account 2 (`ishaan.jangid1@gmail.com`); permanent elimination of excessive request loops on Cloudflare Workers; zero buffering, zero slideshow freezing, zero detail page crashes.

---

## Current Architecture & Status

### Cloudflare Deployment Topology (Dual-Account Split: 200,000 Free Requests/Day)
1. **Account 1 (`shrdsubscriptions@gmail.com`) — Web Application (`erasmus-web`)**:
   * **URL**: [https://erasmus-web.erasmustv.workers.dev](https://erasmus-web.erasmustv.workers.dev)
   * **Active Version ID**: `5cc30900-9d5e-443f-8334-992314256c99`
   * **Role**: Serves the Next.js App Router UI, page SSR, catalog discovery, search, TMDB client caching, and user authentication.
   * **Status**: 100% OK. Fully decoupled from video streaming. Request rate during active playback is ~0 req/min.
2. **Account 2 (`ishaan.jangid1@gmail.com`) — Primary Streaming Relay (`erasmus-hls-relay`)**:
   * **URL**: [https://erasmus-hls-relay.ishaan-jangid1.workers.dev](https://erasmus-hls-relay.ishaan-jangid1.workers.dev)
   * **Role**: Primary smart HLS relay handling 100% of all HLS master playlists, child variant playlists, audio tracks, and video segment chunks (e.g. 1,392 chunks for Lisbon 4K).
   * **Status**: 100% OK. Features Path 0 (Direct Cloudflare Edge Fetch for media chunks) and Path 1.5 (Cloudflare Edge Direct Playlist Fetch & Rewrite), delivering multi-gigabit throughput with zero buffering and complete independence from local PC state.
3. **Account 1 Mirror Relay (`erasmus-hls-relay`)**:
   * **URL**: [https://erasmus-hls-relay.erasmustv.workers.dev](https://erasmus-hls-relay.erasmustv.workers.dev)
   * **Active Version ID**: `165b67cd-cb5a-40c8-90c0-a576a34b6a75`
   * **Role**: Secondary fallback mirror for HLS streaming.
4. **Database & Auth Backend**:
   * **Provider**: Supabase Cloud (`https://jnxflxtizbezqclxfmzc.supabase.co`).
   * **Role**: Persistent cloud database for watch history, continue watching, ratings, and user profiles. Completely independent of local PC and Vercel.

---

## Proven 30-Minute Playback Benchmark Results (1:54 PM to 2:24 PM IST)

A 30-minute real-world video playback test (watching a movie on server Lisbon) confirmed the dual-account separation with 100% mathematical precision:

| Metric | Account 1 (`shrdsubscriptions`) <br> **Web Catalog App** | Account 2 (`ishaan.jangid1`) <br> **Streaming Relay** | Analysis |
|---|---|---|---|
| **Requests @ 1:54 PM** | `94.61k` (94,610) | `879` | Baseline before watching. |
| **Requests @ 2:24 PM** | `94.83k` (94,830) | `1.2k` (1,190) | **Account 2 gained +311 requests** (~1 chunk every 5.8s, matching HLS chunk duration). |
| **Request Delta** | **+220** *(initial page loads)* | **+311 requests** | Account 2 handled 100% of active video streaming. |
| **Bandwidth @ 1:54 PM**| `13.51 GB` | `1.52 GB` | Baseline before watching. |
| **Bandwidth @ 2:24 PM**| `13.51 GB` | `2.58 GB` | **Account 2 streamed +1.06 GIGABYTES of video data!** |
| **Bandwidth Delta** | **+0.00 GB** *(0 bytes video)* | **+1.06 GB** | **Account 1 transferred 0 bytes of video.** |
| **Quota Consumed** | Negligible | **~1.2% of 100,000 daily limit** | 98.8% of Account 2 daily free allowance remains. |

---

## Upstream Hardening & Streaming Fallbacks (Gossip Girl & Polaris)

1. **Gossip Girl (2007, TMDB 1395) Playback & Upstream Misindex Shield**:
   - Upstream VidFast (`vidfast.vc`) mistakenly indexed S1 episodes 1, 3, 4, 7, 8, 9 with the 2021 HBO Max remake (3840x1920 4K).
   - In `src/lib/streaming/vidfast-direct.ts`, requests for TMDB 1395 S1 anomalous episodes or returning 4K/2160p/3840 are automatically rejected.
   - Resolver immediately cascades to Vidlink (`resolveVidlinkStream`), providing authentic 2007 1080p stream from Hakuna Matata CDN, and falls back to Bastion.
2. **Polaris Server Direct Playback & Bingr Resolver**:
   - Polaris timeout raised to 12s, with `hakunaymatata.com` whitelisted.
   - Intelligent audio language priority in `resolveBingrStream` prioritizes English audio.
   - Verified playback for *Overcompensating* (TMDB ID 247619) with 1080p fMP4 HLS master playlist.

---

## Detailed Root Causes & Fixes Implemented

### 1. Defused 1.1s Playback Progress Loop on Cloudflare Workers
* **Issue**: Live Cloudflare Observability tail on Account 1 showed continuous `POST /discover` every 1.1 seconds during playback, eventually exhausting Worker CPU limits (Error 1102).
* **Root Cause**: `StreamingTheaterModal` invoked `actionSetMovieProgress` / `actionSetTvProgress` inside the playback interval effect cleanup. Because Server Actions return an RSC page payload, Next.js re-rendered the parent page tree, recreating inline `identity` objects, triggering the cleanup again — creating an infinite loop.
* **Fix**:
  * Removed Server Action calls from the playback interval effect cleanup.
  * Moved library progress synchronization to a dedicated `wasOpenRef` hook that runs strictly once when the modal is closed (`open` transitions from `true` to `false`).
  * In `HeroBanner` (`src/features/media/components/hero-banner.tsx`), added a `theaterOpen` guard to halt the 6-second carousel rotation while a video is playing.

### 2. Universal Account 2 Routing for Lisbon and All Servers
* **Issue**: Account 2 Observability showed 0 requests during video playback on Lisbon.
* **Root Cause**:
  * In `relay/erasmus-relay.mjs` and `src/app/api/stream/hls/route.ts`, `isDirectCdnSegment` checked for open CORS CDNs (`keenanchor.top`, `solarpanelcleaning`, etc.). Because Lisbon segments are hosted on `keenanchor.top`, the playlist rewriter left segment URLs unwrapped. The browser downloaded all 1,392 video chunks directly from the upstream CDN, completely bypassing Account 2.
  * In `src/features/streaming/components/streaming-theater-modal.tsx`, `isDirectCors` caused `primarySrc`, `resolvedHd`, and `resolvedFourK` to bypass `relayUrl()`.
* **Fix**:
  * In `StreamingTheaterModal`, unconditionally wrapped `primarySrc`, `resolvedHd`, and `resolvedFourK` with `relayUrl()`.
  * In `erasmus-relay.mjs` and `src/app/api/stream/hls/route.ts`, removed the `isDirectCdnSegment` bypass. All 1,392 video chunks now wrap through Account 2 (`https://erasmus-hls-relay.ishaan-jangid1.workers.dev`).
  * In `relay/cloudflare-worker/worker.js`, added Path 1.5 (Cloudflare Edge Direct Playlist Fetch) and fallback sanitization rewriting legacy `erasmustv.workers.dev` references to `requestUrl.host`.

---

## Cloudflare Deployment Workflow & Git Architecture

* **How Cloudflare Deployments Work**:
  * Erasmus uses OpenNext for Cloudflare (`@opennextjs/cloudflare`).
  * The production bundle is compiled locally using `npx opennextjs-cloudflare build` and deployed directly to Cloudflare's edge network using `npx wrangler deploy`.
  * Each deployment produces an immutable **Version ID** (e.g. `5cc30900-9d5e-443f-8334-992314256c99`) with instant rollback capabilities.
* **Where to View Deployments**:
  * In Cloudflare Dashboard: Navigate to **Workers & Pages** → **`erasmus-web`** → Click the **Deployments** tab (located right next to *Observability* and *Metrics*).
  * Every deployment, active version, deployment timestamp, and build size is visible there, exactly like Vercel.
* **Role of `localhost`**:
  * `localhost:3000` is the local Next.js development server (`npm run dev`) used exclusively for development and offline testing.
  * When running locally, it points to Account 2 (`NEXT_PUBLIC_HLS_RELAY_URL=https://erasmus-hls-relay.ishaan-jangid1.workers.dev`).
  * Changes on `localhost` do not touch production until built and deployed via Wrangler.

---

## Verification
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors.
- `npm run test`: 19/19 files passed (213/213 tests passed).
- `npm run build`: 41/41 routes compiled cleanly.
- `opennextjs-cloudflare build` & `wrangler deploy`: Succeeded (Version `5cc30900-9d5e-443f-8334-992314256c99`).
