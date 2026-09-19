# STATE

Updated: 2026-09-20
Git: local branch `main`

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Clean Monochrome Palette & Complete Removal of Blue Accents:
  - System tokens in `src/app/globals.css` updated to pure monochrome silver/white/neutral palette (`--primary: 0 0% 98%`, `--primary-foreground: 0 0% 5%`, `--nav-active: 0 0% 20%`, `--accent: 0 0% 13%`, `--ring: 0 0% 90%`).
  - Removed blue `rgba(29,144,245,...)` shadows and replaced with crisp white/neutral shadows across stream buttons.
  - Replaced blue, cyan, and indigo caustic blur blooms in sidebar navigation with clean crystalline glass refractions.
  - Neutralized `--electric` and `.text-silver` gradients to pure platinum/silver.
  - Neutralized marketing showcase fallback hues to clean monochrome.
- Redesigned Hero Banner Action Buttons matching Bingr Reference:
  - Button 1: Circular pure white play button (`rounded-full bg-white text-black shadow-xl hover:scale-105 active:scale-95`) with solid black play icon (`<Play className="fill-black text-black ml-0.5" />`).
  - Button 2: Pill-shaped glass "See More" button (`rounded-full border border-white/25 bg-black/45 hover:bg-white/15 px-6 py-3.5 text-white`) with info icon (`<Info className="h-5 w-5" />`).
  - Badges row updated to drop blue: "Featured" badge now uses clean glass monochrome styling (`border-white/20 bg-white/10 text-white`).
- Miniature Landscape Thumbnail Carousel Navigation on HeroBanner (`src/features/media/components/hero-banner.tsx`):
  - Replaced legacy progress dots and capsule with a miniature landscape thumbnail preview strip matching the Bingr design reference.
  - Displays landscape backdrop thumbnails (`backdropUrl(s.backdropPath ?? s.posterPath, "w300")`) for each featured slide with rounded corners (`rounded-lg`).
  - Active thumbnail has high-contrast white rounded border (`ring-2 ring-white ring-offset-2 ring-offset-black/80 rounded-lg scale-105 z-10 opacity-100 shadow-xl shadow-black/80`).
  - Inactive thumbnails are dimmed and subtly responsive (`opacity-40 hover:opacity-85 hover:scale-[1.02] transition-all`).
  - Clean chevron navigation arrows (`<` and `>`) flanking the strip for desktop and mobile navigation.
  - Automatically scrolls active thumbnail into view (`thumbStripRef` with `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })`).
  - Timer-based auto-advance every 6s (`intervalMs`), automatically pausing on hover (`onMouseEnter`/`onMouseLeave`).
- Continue Watching Horizontal Landscape Shelf on Discover (`/discover`):
  - Added a horizontal scroll shelf for Continue Watching placed at the top of media shelves on the Discover page.
  - Horizontally placed landscape cards (`orientation="landscape"` with `aspect-video` 16:9 ratio).
  - Official titled artwork from TMDB: uses the official studio promotional landscape backdrops from TMDB (`images.backdrops` where `iso_639_1: "en"`, sorted by rating/popularity) identical to bingr.one's `logo_backdrop` (e.g. Spider-Man: Into the Spider-Verse, Game of Thrones, Breaking Bad, The Tonight Show Starring Jimmy Fallon, Off Campus).
  - No artificial logo overlays: completely removed all floating/pasted PNG logo overlays. If a title lacks an English titled backdrop in TMDB, it cleanly displays the natural clean backdrop without fake overlays.
  - Landscape card sizing (`w-64 sm:w-72 md:w-80 lg:w-[22rem] shrink-0 snap-start`) with smooth horizontal scrolling and desktop chevron navigation buttons (`ChevronLeft`, `ChevronRight`).
  - Live progress edge bar, season/episode badges, dynamic subtitle metadata (`S1 · E4 · 45% watched` or `${m} left`), and hover removal ("X").
  - Seamlessly pulls from both client playback storage (`localStorage`) and authenticated server library (`actionGetContinueWatching`). If empty, returns `null` with no blank space or empty state on Discover.
- Restored Authentic Studio-Titled Logo Thumbnails (Zero-Delay & Guaranteed Freshness):
  - Fixed cache-poisoning bug where `backdrop-cache.ts` previously primed unverified, textless backdrop paths from raw playback items and aborted `/api/media/details` fetches via early returns (`if (cached) return;`).
  - Purged legacy polluted caches (`erasmus:media:backdrop_cache`, etc.) and moved to strict `erasmus:media:verified_logos_v3`.
  - Re-architected `src/lib/media/backdrop-cache.ts` to strictly store and return *only* verified studio-titled backdrops (directly matching `enBackdropPath` or `logoBackdropPath`). Unverified textless backdrops are never cached as logo backdrops.
  - In `src/features/library/components/library-poster-card.tsx`, initial state binds instantaneously to verified logo backdrops (~0ms), and network lookups with cache buster `_cb=${Date.now()}` are never blocked, guaranteeing fresh studio-titled artwork always resolves and persists.
  - In `src/features/library/components/continue-watching-rail.tsx`, lookups run across all rail entries to retrieve authentic titled backdrops and write them back into `localStorage["erasmus:playback:recent"]`, so raw recent items themselves maintain authentic studio-titled artwork.
  - In `src/app/api/media/details/route.ts`, Cache-Control is strictly `no-store, no-cache, must-revalidate` to eliminate browser-level caching of stale textless responses.
- Clean Poster Hover Interactions:
  - Removed the centered blue play button (`bg-primary text-primary-foreground`) and full-card dark overlay on hover across poster cards (`library-poster-card.tsx`).
  - Cards now provide a clean, uncluttered hover state where artwork smoothly scales without obstruction or dimming, preserving the title artwork and logos. Clicking anywhere on the card navigates directly to the title page.
  - The top-right remove ("X") button remains preserved on Continue Watching cards so users can dismiss items anytime.
- Merged Homepage & Profile Architecture:
  - Homepage (`/dashboard`) is merged with the Profile page, titled "Profile", retaining the dominant dashboard intelligence experience (stats, charts, continue watching, library explorer, trending, recommendations) and integrating user profile identity in the header.
  - Legacy `/profile` route cleanly forwards to `/dashboard` via server-side redirect.
  - Sidebar updated so **Discover** (`/discover`) is topmost and default in `MAIN_NAV`, and **Profile** (`/dashboard`) is placed in `SECONDARY_NAV` directly above Settings.
- Full Discover-Style Architecture Across Movies, TV Shows, and Anime:
  - Redesigned **Movies** (`/movies`), **TV Shows** (`/tv`), and **Anime** (`/anime`) pages with edge-to-edge full-bleed layouts, HeroBanners, GenreChips, MediaRows, and FilterBars.
- Full-viewport Browser Theater Player (`streaming-theater-modal.tsx` & `native-player.tsx`):
  - Edge-to-edge windowed fullscreen within browser viewport (`fixed inset-0`).
  - Lisbon set as default primary server (`isPrimary: true`).
- Verification: Zero lint errors (`npm run lint`), zero build errors (`npm run build` across 41/41 routes).

## Broken / Risky
- Full video traffic still passes through Vercel via `/api/stream/hls` for non-passthrough CDNs (bandwidth problem).
- Desktop Chrome/Firefox direct HLS requests can hit upstream CDN CORS restrictions.
- Profile integration with Supabase `watch_profiles` (used by the TV app) caused playback problems and was reverted. Do not touch Supabase settings or schema.
- Proxy and resolver disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`) for upstream CDN nodes.

## In progress
- Complete: HeroBanner action buttons redesigned to circular white Play + pill "See More"; blue accents completely removed from design system tokens and components across the site; 0 lint errors, 0 build errors; strictly local (no git push).

## Next
- Await user feedback on the updated monochrome aesthetics and buttons.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
