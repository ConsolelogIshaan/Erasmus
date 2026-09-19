# STATE

Updated: 2026-09-19
Git: local branch `main`

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Full Discover-Style Architecture Across Movies, TV Shows, and Anime:
  - Redesigned **Movies** (`/movies`), **TV Shows** (`/tv`), and **Anime** (`/anime`) pages to mirror the exact Discover page structure.
  - Resolved layout misalignment and side/top margins by enabling `isFullBleed` in `AppShell` (`src/components/layout/app-shell.tsx`) for `/movies`, `/tv`, and `/anime`. The pages now render 100% full-bleed and edge-to-edge behind the floating frosted sidebar and transparent header with zero unwanted wrapper padding.
  - Immersive full-bleed **HeroBanner** on top of each page with rotating featured titles, pre-enriched official logos and taglines, ambient color palettes, Ken Burns crossfades, ratings, synopsis, and direct Play / More Info actions.
  - Interactive **GenreChips** tailored to each media category (Movie genres, TV genres, and Anime sub-genres).
  - Curated horizontal **`MediaRow`** shelves across all three pages with smooth carousel scrolling, right arrow navigation, and dedicated catalog links.
  - Full catalog explorer grid with `FilterBar` and `PaginationControls` supporting deep filtering and pagination when exploring the full library. Clicking "Browse All Movies / TV Shows / Anime" (or selecting filters) immediately loads the direct explore view without a hero banner, starting seamlessly below the header with the category title, filters, and poster grid.
- Uncapped Anime Catalog (11,400+ Titles):
  - Fixed the 4-page anime limitation by removing the default vote-count floor (`voteCountGte: 500`) in `anime.ts`, unlocking all 272+ pages of anime series (5,400+ shows) and 301+ pages of anime films (6,000+ films) from the TMDB API.
- Dashboard Layout & Library Integration:
  - Merged Library page into the Home page (`/dashboard`) with an integrated Library explorer section supporting status, type, and sort filters with direct poster grid.
  - Rebalanced dashboard layout to eliminate wasted vertical whitespace: `Continue watching` is a full-width horizontal rail, `ActivityAreaChart` and `GenrePieChart` are paired side-by-side in a dedicated `md:grid-cols-2` analytics row with quick-link actions, `Recently completed` is paired with `Plan to watch` in a symmetric `lg:grid-cols-2` grid, and `Recently rated` is paired with `Dropped` in a symmetric `lg:grid-cols-2` grid.
  - Clicking "Continue watching", "Your Library", "Recently completed", "Dropped", or "Recently rated" (including header arrows) navigates directly to `/library`.
  - Removed Library and Stats links from the main sidebar navigation.
  - Stats page (`/stats`) redirects cleanly to `/dashboard`.
- Cleaned Navigation & Sidebar Design:
  - Removed the vertical blue bar inside the active sidebar selector, preserving the clean frosted liquid glass pill capsule, borders, and glowing active icon.
  - Sidebar order: Home → Discover → For You → Movies → TV Shows → Anime → Watchlist → Favorites → Friends.
  - Anime sidebar entry uses the exact user-provided custom icon (`public/icons/anime.png`), rendered through `AnimeIcon` via CSS mask to inherit dynamic sidebar states (idle muted, hover white, active glowing blue).
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
1. Confirm user approval for committing and pushing the redesigned Movies, TV Shows, and Anime showcase pages.
2. Verify browser-window and OS fullscreen transitions on staging and mobile/desktop clients.
3. Monitor Vercel bandwidth impact from whitelisting `keenanchor.top` direct CDN segments.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
