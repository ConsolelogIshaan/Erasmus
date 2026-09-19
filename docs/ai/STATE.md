# STATE

Updated: 2026-09-19
Git: clean, branch `main` (tracking `origin/main`)

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Dashboard & Library Integration:
  - Merged Library page into the Home page (`/dashboard`) with an integrated Library explorer section supporting status, type, and sort filters with direct poster grid.
  - Clicking "Continue watching", "Your Library", "Recently completed", "Dropped", or "Recently rated" (including header arrows) navigates directly to `/library`.
  - Removed Library and Stats links from the main sidebar navigation.
- Dedicated Anime Hub (`/anime`):
  - Created `/anime` page with Series, Top Rated, and Films shelves, dynamic anime sub-genres (Action, Fantasy, Sci-Fi, Adventure, Romance, etc.), and pagination.
  - Added `discoverAnime` and `getAnimeGenres` in `src/lib/media/anime.ts` querying TMDB with genre 16 and original language `ja`.
  - Added Anime to sidebar navigation immediately below "TV Shows", with shortcut `g a`.
- Cleaned Navigation & Stats Page Removal:
  - Sidebar order: Home → Discover → For You → Movies → TV Shows → Anime → Watchlist → Favorites → Friends.
  - Stats page (`/stats`) redirects cleanly to `/dashboard`; updated header buttons and links in wrapped/profile to dashboard and insights.
- Clean Native Streaming Identity:
  - Removed third-party external subscription links ("Available on Netflix/Prime", "Where to watch") across movies, series, and anime hero and details sections, solidifying Erasmus as a self-contained streaming platform.
- Full-viewport Browser Theater Player (`streaming-theater-modal.tsx` & `native-player.tsx`):
  - On clicking Play: opens edge-to-edge windowed fullscreen within browser viewport (`100vw` × `100vh`, `fixed inset-0`, zero margins, zero rounded corners, backdrop completely covered).
  - On clicking Fullscreen button (or pressing `f`): enters native OS/browser fullscreen (`requestFullscreen()`), button toggles to `Minimize2` exit icon.
  - On pressing Escape or Back arrow: exits native fullscreen or closes player back to dashboard cleanly.
  - Native HLS player: 4K/1080p/720p badges, quality ladder, multi-audio, speed menu, episode rail, cinematic pause overlay, next-episode, clean unblocked poster/title layout.
- Flagship Server: Lisbon set as default primary server (`isPrimary: true`).
- Streaming roster (`stream-resolver.ts`):
  - Direct Servers (16 total): Lisbon (4K), Sakura (Anime/Asian), Nebula (US Edge), followed by Bingr clusters: Aphelion (4K), Polaris, Bastion, Hallyu, Nova, Edmunds, AnimeSalt, Ryuu, followed by Solara, Athens (4K), Joy, Castle, Canaias.
  - Embed Fallback Players (5 total): Filmu (`embed.filmu.in`), Vidy, Cinezo, VidBolt, VidRift.
- Resolver chain: VidFast Direct (primary) → Bingr cluster (`bingr-stream.ts`) → Cinejoy/Shegu (secondary). Stremio subtitle fallback; ASS/SSA to WebVTT conversion.
- Split-cour anime/TV episode mapping (`getAlternateTvCoordinates`) with Bravo fallback for continuous split-cour series (e.g., Solo Leveling).
- HLS relay proxy (`/api/stream/hls`): Anycast DNS override, header spoofing, playlist rewriting, English audio default (`enrichAudioTracks`), direct-CDN passthrough for permissive CDNs including `keenanchor.top` (`isDirectCdnSegment`), open CORS (`Access-Control-Allow-Origin: *`), and preflight `OPTIONS` support.
- Android TV app (Cinejoy): WebView, local DNS proxy, D-pad spatial navigation, OSD scrub HUD. Release APK built.
- Verification: Zero lint errors (`npm run lint`), zero build errors (`npm run build` across 41/41 routes), zero TypeScript errors (`npm run typecheck`), all 19 streaming test suites (209 vitest tests) passing.

## Broken / Risky
- Full video traffic still passes through Vercel via `/api/stream/hls` for non-passthrough CDNs (bandwidth problem).
- Desktop Chrome/Firefox direct HLS requests can hit upstream CDN CORS restrictions.
- Profile integration with Supabase `watch_profiles` (used by the TV app), including backfill into Profile A, caused playback problems and was reverted. Do not retry casually.
- Proxy and resolver disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`) for upstream CDN nodes.

## In progress
- Evaluating direct client-side playback on whitelisted open-CORS edge CDNs (`keenanchor.top`) to reduce Vercel proxy bandwidth.

## Next
1. Verify browser-window and OS fullscreen transitions on staging and mobile/desktop clients.
2. Monitor Vercel bandwidth impact from whitelisting `keenanchor.top` direct CDN segments.
3. Keep profile/backend changes paused until playback stability is verified on production.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
