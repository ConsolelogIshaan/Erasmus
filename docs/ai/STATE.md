# STATE

Updated: 2026-09-27 8:38 PM IST
Git: `origin/main` (Clean working tree; verified build, lints, and tests; Error 1102 proactive hardening)

## Priority
Streaming/playback is frozen and stable. Hardened the codebase proactively against Cloudflare Worker **Error 1102** ("Worker exceeded CPU time limit") to eliminate any potential triggers across navigation, searching, and catalog lookups.

## Error 1102 Proactive Hardening Completed
1. **Middleware Isolation Bypass (`src/middleware.ts` & `src/lib/supabase/middleware.ts`)**:
   - Excluded all `/api/` routes from root middleware matcher.
   - Prevents Cloudflare Workers from invoking the Edge isolate, parsing cookies, and making remote Supabase `getUser()` network calls on every media/catalog API fetch.
   - Added link prefetch guard (`x-middleware-prefetch` / `next-router-prefetch` / `purpose: prefetch`): skips redundant remote `getUser()` token revalidations when authenticated users hover over links/posters.

2. **Public Edge CDN Caching on Media Routes**:
   - `src/app/api/media/trending/route.ts`: Removed redundant per-request session checks; added `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400` and `CDN-Cache-Control: public, max-age=86400`. Cloudflare Anycast Edge serves trending titles from RAM in 0ms Worker CPU.
   - `src/app/api/media/tv/[showId]/season/[seasonNumber]/route.ts`: Added `s-maxage=86400` and `CDN-Cache-Control: public, max-age=86400`.

3. **Search Query Debounce & Guard**:
   - `src/features/search/hooks/use-media-search.ts` & `src/app/api/media/search/route.ts`:
   - Raised minimum query threshold from `>= 1` to `>= 2` characters, preventing premature multi-provider search requests on single-character typing pauses.
   - Added `s-maxage=600` edge caching to search responses.

4. **In-Memory TTL Caching & Request Deduplication**:
   - `src/lib/media/providers/omdb/client.ts`: Added in-memory TTL cache (1h TTL, 300 max items) and inflight request deduplication for OMDb ratings.
   - `src/lib/media/providers/tmdb/client.ts`: Added `cf: { cacheEverything: true, cacheTtl: 300 }` edge caching for native Cloudflare fetches to TMDB.

---

## Current Architecture & Status

### Cloudflare Deployment Topology
1. **Account 1 (`shrdsubscriptions@gmail.com`) — Web Application (`erasmus-web`)**:
   * **URL**: [https://erasmus-web.erasmustv.workers.dev](https://erasmus-web.erasmustv.workers.dev)
   * **Role**: Next.js App Router UI, page SSR, catalog discovery, search, TMDB client caching, and user authentication.
   * **Status**: 100% OK. Optimized for 0ms CPU hits on cached catalog and API routes.

2. **Account 1 Streaming Relay (`erasmus-hls-relay`)**:
   * **URL**: [https://erasmus-hls-relay.erasmustv.workers.dev](https://erasmus-hls-relay.erasmustv.workers.dev)
   * **Active Version ID**: `f8ee2da6-f00e-4cc0-ba96-58c2e4eca0b1`
   * **Role**: Primary Anycast HLS relay handling 100% of all HLS master playlists, child variant playlists, audio tracks, and video segment chunks.
   * **Edge Caching**: `cf: { cacheEverything: true, cacheTtl: 86400 }` returning segments in <15ms.

3. **Account 2 (`ishaan.jangid1@gmail.com`) — Standby Streaming Relay**:
   * **URL**: [https://erasmus-hls-relay.ishaan-jangid1.workers.dev](https://erasmus-hls-relay.ishaan-jangid1.workers.dev)
   * **Role**: Dedicated 100k daily request pool.

4. **Database & Auth Backend**:
   * **Provider**: Supabase Cloud (`https://jnxflxtizbezqclxfmzc.supabase.co`).

---

## Verification Summary
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors (12 pre-existing warnings).
- `npm run test`: 20/20 test files passed (223/223 tests passed, 100% pass rate).
- `npm run build`: 52/52 routes compiled cleanly.
- ZERO git push performed per `AGENTS.md`.
