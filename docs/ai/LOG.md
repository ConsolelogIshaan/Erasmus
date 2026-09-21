# LOG

Append-only. Add new entries at the bottom. Never edit old entries.
Format: `## DATE | Developer | AI` then Changed / Files / Result / Next.

Entries below are condensed from the git history (70 commits, 2026-07-10 to 2026-09-19). AI used is unknown for historical entries.

## 2026-07-10 to 2026-07-13 | Paarth | unknown
- Changed: Project created as Argus (Next.js, TypeScript, Tailwind). Supabase auth, TMDB catalog, dark UI, library progress, system theme, service worker cache-busting, poster fix for Vercel image optimization 402 (unoptimized external images), poster quick actions, translucent UI, Fuse.js fuzzy search, Unlumen sidebar and command menu.
- Commits: 1051ef4, 2209843, 588ed42, f8e6ce3, 1bf27b8, d02078b, f4fc903, 00da9f5

## 2026-08-28 | Paarth | unknown
- Changed: Hardened Supabase auth calls (retry/backoff on token refresh), polished landing page.
- Commit: 03d8713

## 2026-08-28 to 2026-08-30 | Ishaan | unknown
- Changed: Friends/social features, activity feed, public profiles (`/u/[username]`), episode checklist with reversible status, recommendation engine, cast/crew credits and `/person/[id]`, profile validation, Supabase RLS updates, route guards (`src/lib/api/guard.ts`), redirect sanitization. Merged via PRs #1 to #5.
- Commits: 06d9b85 to 2bb2e63

## 2026-08-29 to 2026-08-30 | Paarth | unknown
- Changed: Sidebar refinement, pure dark theme (#0a0a0c), `/privacy` and `/terms` pages, copy polish. Merged via PR #6.
- Commits: 52455cd, 4fdb2fa, c32721e

## 2026-09-11 to 2026-09-12 | Ishaan | unknown
- Changed: In-app playback with resume and silent stream fallback. Replaced iframe embeds with native HLS.js player (`native-player.tsx`). Subtitle proxy route (`/api/stream/subs/file`), Origin header dropped for subtitle list fetch, Stremio subtitle fallback. Player polish: speed menu, scrubbing, first episode picker.
- Commits: 9486c63 to 9e23897

## 2026-09-13 | Ishaan | unknown
- Changed: Repo push tests. Cinematic search redesign, TV resume, Continue Watching integration. Centered cinematic pause overlay. `enrichAudioTracks` forcing English audio default in HLS relay, poster auto-heal, subtitle proxy. TypeScript strict-null fix.
- Commits: 9722a6b, 9c15a0c, e6ad1d4, d75c7c6, 959568e, 3606cb8

## 2026-09-14 | Ishaan | unknown
- Changed: OAuth callback timeout fix, UI scale-up for widescreen/TV, hero banner logo pre-enrichment and preloading.
- Commits: bd5cef3, ac7dc3c, 21f34a7

## 2026-09-15 | Ishaan | unknown
- Changed: Fixed split-cour anime episode scrambling (then generalized to all TV shows), full ASS/SSA to WebVTT converter, public season lists, next-episode support, glassmorphism player with 4K/HD badges, horizontal episode rail with thumbnails, auto-select highest quality. Rebranded Argus to Erasmus (56 files, 98 replacements), new orbit logo and favicons.
- Commits: 319400d to 6058410

## 2026-09-16 | Ishaan | unknown
- Changed: IMDb and Rotten Tomatoes ratings via OMDb, trailer backdrop blending, ambient palette API (`/api/media/ambient-palette`), transparent header, OMDb default fallback key. Lenis smooth scrolling added, then reverted (interfered with horizontal rails and mobile touch scrolling).
- Commits: 9b9459e, 4e3a7e1, 0cd9940, d26a187, 68a2401

## 2026-09-17 | Ishaan | unknown
- Changed: `vidfast-direct.ts` (VidFast direct HLS via enc-dec.app token decryption), TLS bypass for Cinejoy CDN, verbose tracing, 4K detection and Lisbon server badge restored, ABR startup tuning (maxBufferLength 30, maxMaxBufferLength 60), full quality ladder (4K/1080p/720p/480p), companion streams, multi-audio, multi-cour coordinate fallbacks (`getAlternateTvCoordinates`).
- Commits: 081fbc7, 7297ac2, 69aeb77, 19bc503, f80305e, 30d7447

## 2026-09-18 | Ishaan | unknown
- Changed: Platform integrity updates, subtitle stability, player quality badge refinements, media details route error handling.
- Commit: 378319c

## 2026-09-19 | Ishaan | unknown
- Changed: Restored the 6 core streaming files from `BACKUP/stream_fix_backups/` after latency regressions (unauthorized server prioritization, sequential lookups). VidFast primary, Cinejoy secondary.
- Files: cinejoy-stream.ts, direct-stream.ts, native-player.tsx, `/api/stream/hls/route.ts`, streaming-theater-modal.tsx, vidfast-direct.ts
- Commit: 00b98fe

## 2026-09-19 | Paarth | Claude
- Changed: Created shared AI context files (`AGENTS.md`, `docs/ai/STATE.md`, `docs/ai/LOG.md`) from the project dossier. No code changes.
- Next: Get Bingr investigation output and compare against the current Argus/Erasmus stream flow.

## 2026-09-19 | Paarth | Gemini
- Changed: Renamed local branch to `Bingr` and pushed to `origin/Bingr`. Integrated Bingr streaming cluster resolvers (`bingr-stream.ts`) and embed fallback providers (`embed.filmu.in`, Vidy, Cinezo, VidBolt, VidRift). Set Lisbon as the default primary server (`isPrimary: true`). Reordered direct server lineup to place Bingr clusters (Aphelion, Polaris, Bastion, Hallyu, Nova, Edmunds, AnimeSalt, Ryuu) directly below Nebula. Removed redundant center play button overlay from `native-player.tsx`. Hardened HLS relay with CORS headers and `keenanchor.top` direct segment whitelist. Preserved multi-cour Bravo fallback in `vidfast-direct.ts` for continuous split-cour series (e.g. Solo Leveling). Fixed remaining lint/type warnings in `subs/route.ts` and `wyzie.ts`.
- Files: `src/lib/streaming/bingr-stream.ts`, `src/lib/streaming/stream-resolver.ts`, `src/lib/streaming/stream-resolver.test.ts`, `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/servers-modal.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `src/app/api/stream/hls/route.ts`, `src/lib/streaming/vidfast-direct.ts`, `src/lib/streaming/direct-stream.ts`, `src/app/api/stream/subs/route.ts`, `src/lib/streaming/wyzie.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Branch `Bingr` committed (`3f6993c`) and pushed to `origin/Bingr`. `npm run build` passed cleanly (40/40 routes generated), `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), all 42 streaming tests passed.
- Next: Review `Bingr` branch playback on staging and prepare PR to `main`.

## 2026-09-19 | Paarth | Gemini
- Changed: Merged `Bingr` branch into `main` and pushed to `origin/main`. Replaced the centered/padded dialog container in `streaming-theater-modal.tsx` with an edge-to-edge full-viewport browser player (`fixed inset-0 w-screen h-screen rounded-none border-0`), eliminating the empty background backdrop and blurred space behind the player upon clicking Play. Enhanced native and embed player fullscreen handling so clicking the Fullscreen button (or pressing `f`) activates the native OS/browser Fullscreen API (`requestFullscreen()`), toggling the icon between `Maximize2` and `Minimize2`.
- Files: `src/features/streaming/components/streaming-theater-modal.tsx`, `src/features/streaming/components/native-player.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified on `main` branch. `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run build` passed (40/40 routes generated), streaming vitest tests passing.
- Next: Push latest changes to `main` and deploy to production.

## 2026-09-19 | Paarth | Gemini
- Changed: Removed third-party external "Available on" / "Where to watch" provider sections across all movie, series, and anime pages. Since Erasmus is a self-contained direct streaming platform, showing external provider recommendations (Netflix, Prime Video, etc.) was redundant and conflicting. Disabled `StreamingProviders` component (rendered `null`), removed from `detail-hero.tsx`, `tv/[id]/page.tsx`, and `movie/[id]/page.tsx`, and adjusted marketing copy in `capabilities-section.tsx` to highlight seamless direct streaming.
- Files: `src/features/media/components/detail-hero.tsx`, `src/app/(app)/movie/[id]/page.tsx`, `src/app/(app)/tv/[id]/page.tsx`, `src/features/media/components/streaming-providers.tsx`, `src/features/marketing/components/capabilities-section.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified on `main` branch. `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run build` compiled 40/40 routes cleanly, all streaming vitest tests passing.
- Next: Push changes to `origin/main` and `origin/Bingr`.

## 2026-09-19 | Paarth | Gemini
- Changed: Merged the Library page into the Home page (`/dashboard`), featuring an embedded library explorer with status, type, and sort filters and a direct poster card grid. Linked "Continue watching", "Your Library", "Recently completed", "Dropped", and "Recently rated" section titles and chevron arrows directly to `/library`. Removed Library and Stats from the sidebar navigation. Reordered sidebar navigation to place "Movies" and "TV Shows" directly below "For You". Created a dedicated Anime browse page (`/anime`) with Series, Top Rated, and Films shelves, dynamic anime sub-genres, and TMDB Japanese animation query integration (`src/lib/media/anime.ts`). Added Anime to the sidebar directly below TV Shows with `Sparkles` icon and `g a` shortcut. Removed the Stats page, redirecting `/stats` directly to `/dashboard`.
- Files: `src/app/(app)/dashboard/page.tsx`, `src/constants/navigation.ts`, `src/constants/routes.ts`, `src/constants/shortcuts.ts`, `src/lib/media/anime.ts`, `src/app/(app)/anime/page.tsx`, `src/app/(app)/stats/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/app/(app)/wrapped/page.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified on `main` branch. `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run test` passed (19/19 files, 209 tests), `npm run build` compiled all 41 routes with zero errors.
- Next: Push latest changes to `origin/main` and `origin/Bingr`.

## 2026-09-19 | Paarth | Gemini
- Changed: Fixed layout misalignment and excessive side/top padding on the Movies (`/movies`), TV Shows (`/tv`), and Anime (`/anime`) pages. In `src/components/layout/app-shell.tsx`, the `isFullBleed` route matcher previously only included `/discover` and `/tv/[id]`, `/movie/[id]`. Consequently, `/movies`, `/tv`, and `/anime` were erroneously wrapped in the constrained `<div className="content-container min-w-0 py-6 sm:py-8 lg:py-10">` with sticky non-floating headers, causing huge black gutters, constrained hero width, and misaligned hero banners. Updated `isFullBleed` in `app-shell.tsx` to match `/^\/(discover|movies|tv|anime)\/?$/`, allowing the hero banner and shelves on Movies, TV Shows, and Anime to render 100% full bleed, edge-to-edge behind the floating frosted glass sidebar and transparent header, exactly matching the Discover page.
- Files: `src/components/layout/app-shell.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run test` passed (19/19 test files, 209 tests passed), `npm run build` compiled all 41 routes cleanly. No git push performed.
## 2026-09-19 | Paarth | Gemini
- Changed: Removed the vertical blue bar indicator from the sidebar active selector in `src/components/layout/sidebar.tsx` while preserving the frosted liquid glass active capsule and glow. Reorganized the Home dashboard (`src/app/(app)/dashboard/page.tsx`) to eliminate the massive empty space beneath the charts: converted `Continue watching` to a full-width horizontal rail, placed `ActivityAreaChart` and `GenrePieChart` side-by-side in a dedicated 2-column analytics row (`md:grid-cols-2`) with top-right quick links, paired `Recently completed` with `Plan to watch` in a symmetric 2-column grid (`lg:grid-cols-2`), and paired `Recently rated` with `Dropped` in a 2-column grid.
- Files: `src/components/layout/sidebar.tsx`, `src/app/(app)/dashboard/page.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run build` compiled all 41 routes cleanly. No git push performed.
## 2026-09-19 | Paarth | Gemini
- Changed: Merged the homepage (`/dashboard`) with the Profile page so the intelligence dashboard dominates while housing profile identity in the header (avatar, @username, bio, member since) and the interactive "Edit profile" form (`ProfileForm`) at the very bottom. Updated `src/constants/navigation.ts` to remove Home from `MAIN_NAV`, elevating Discover to the topmost and default navigation item, and placed Profile (`ROUTES.dashboard`) as the second-to-last item on the sidebar in `SECONDARY_NAV` directly above Settings. Updated `src/app/(app)/profile/page.tsx` to redirect cleanly to `ROUTES.dashboard`. Updated `src/app/(marketing)/page.tsx` to redirect authenticated users to `ROUTES.dashboard`. Updated default Logo link and user menu Profile link to `ROUTES.dashboard`. Updated `g p` keyboard shortcut to `ROUTES.dashboard`.
- Files: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/app/(marketing)/page.tsx`, `src/components/layout/logo.tsx`, `src/components/layout/user-menu.tsx`, `src/constants/navigation.ts`, `src/constants/shortcuts.ts`, `docs/keyboard-shortcuts.md`, `docs/architecture.md`, `README.md`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Zero lint errors (`npm run lint`), zero build errors (`npm run build` across 41/41 routes). Committed and pushed to `origin/main`.

## 2026-09-20 | Paarth | Gemini
- Changed: Upgraded the Discover page (`/discover`) "Continue Watching" row to render cards in true horizontal landscape orientation (`orientation="landscape"` with `aspect-video` 16:9 ratio) and display each title's authentic official titled artwork, aligning exactly with how sites like `bingr.one` obtain and display them. Fixed root causes where browsers were still showing stale textless backdrops:
  1. In `src/lib/media/providers/tmdb/mappers.ts`, updated `mapMovieDetails` and `mapTvDetails` so `backdropPath` itself defaults directly to the highest-rated English titled promotional backdrop (`enBackdrop?.file_path ?? raw.backdrop_path ?? null`).
  2. In `src/app/api/media/details/route.ts`, removed the aggressive `Cache-Control: max-age=86400` header that was forcing browsers to serve stale cached textless image paths for 24 hours; set to `no-store, no-cache, must-revalidate`.
  3. In `src/features/library/components/library-poster-card.tsx`, added a prop-sync effect for `entry.backdrop_path` and `entry.poster_path`, eliminated artificial logo overlays, and added cache-busting `_cb` timestamps to details queries so cards re-render with the new titled backdrop immediately.
  4. In `src/features/library/components/continue-watching-rail.tsx`, enhanced lookup reconciliation by matching both `id` and `tmdbId` / `mediaType`, instantly saving the resolved titled backdrops to `localStorage` (`erasmus:playback:recent`) to ensure instant, persistent loads on subsequent visits.
- Files: `src/lib/media/providers/tmdb/mappers.ts`, `src/types/media.ts`, `src/app/api/media/details/route.ts`, `src/features/library/components/library-poster-card.tsx`, `src/features/library/components/continue-watching-rail.tsx`, `src/features/library/actions/library-actions.ts`, `src/app/(app)/discover/page.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors), `npm run build` compiled all 41 routes cleanly. No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Removed intrusive blue circular play buttons (`bg-primary text-primary-foreground`) and full-card dark overlays appearing on hover across poster cards in `src/features/library/components/library-poster-card.tsx` (both landscape 16:9 and portrait 2:3 formats). Posters now provide a clean, modern aesthetic where the authentic titled backdrops and artwork remain completely unobstructed and vibrant on hover, smoothly scaling up with subtle border/shadow highlights. Users can click anywhere on the card to navigate directly to the title page via Next.js `<Link>`. Kept the top-right remove ("X") button intact on Continue Watching cards for easy item dismissal.
- Files: `src/features/library/components/library-poster-card.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors), `npm run build` compiled all 41 routes cleanly. No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Made Continue Watching logo thumbnails load instantaneously (0ms on initial render) without the 2-3 second delay and visual thumbnail swapping.
  1. Built a synchronous client-side backdrop cache (`src/lib/media/backdrop-cache.ts`) using an in-memory Map and persistent localStorage (`erasmus:media:backdrop_cache`), primed from local playback history.
  2. In `src/features/library/components/continue-watching-rail.tsx`, initialized state synchronously from recent playback so cards mount immediately on frame zero with their logo backdrops rather than waiting for an async server action.
  3. In `src/features/library/components/library-poster-card.tsx`, initialized `resolvedBackdrop` and `resolvedPoster` synchronously from the backdrop cache so `<Image>` tags receive the studio-titled artwork immediately on frame zero. Avoided redundant fetches for titles already in cache and removed cache-busting query params.
  4. In `src/features/streaming/components/streaming-theater-modal.tsx`, resolved and persisted `resolvedBackdropPath` to the backdrop cache and playback history upon playback.
  5. In `src/app/api/media/details/route.ts`, enabled public browser caching (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`) so subsequent details queries resolve in 0ms from browser cache.
- Files: `src/lib/media/backdrop-cache.ts`, `src/features/library/components/continue-watching-rail.tsx`, `src/features/library/components/library-poster-card.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `src/app/api/media/details/route.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors), `npm run build` compiled all 41 routes cleanly. No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Restored authentic studio-titled logo backdrops across all Continue Watching and landscape cards, resolving the bug where an overzealous cache attempt previously froze cards on unverified, textless images:
  1. Identified root cause: `backdrop-cache.ts` had previously primed its in-memory map from raw recent playback items containing unverified, textless backdrop paths and aborted subsequent network queries with `if (cached) return;`, permanently locking cards into textless backdrops.
  2. Purged contaminated legacy storage keys (`erasmus:media:backdrop_cache`) and introduced strict `erasmus:media:verified_logos_v3` that *only* stores verified studio-titled backdrops (matching `enBackdropPath` or `logoBackdropPath`).
  3. In `src/features/library/components/library-poster-card.tsx`, bound initial state synchronously to verified logo backdrops for 0ms instant display, removed the blocking early return, and ensured queries to `/api/media/details` run with cache-busting timestamp `_cb=${Date.now()}` to guarantee fresh titled artwork resolves and persists.
  4. In `src/features/library/components/continue-watching-rail.tsx`, removed cache-skipping filter in lookup and ensured all items in Continue Watching query `/api/media/details` and persist the authentic titled backdrop back into `localStorage["erasmus:playback:recent"]`.
  5. In `src/app/api/media/details/route.ts`, set `Cache-Control` strictly to `no-store, no-cache, must-revalidate` to prevent any stale textless responses from persisting in browser HTTP caches.
- Files: `src/lib/media/backdrop-cache.ts`, `src/features/library/components/library-poster-card.tsx`, `src/features/library/components/continue-watching-rail.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `src/app/api/media/details/route.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled). No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Re-arranged `HeroBanner` (`src/features/media/components/hero-banner.tsx`) layout per user screenshot markings:
  1. Removed the top badges row (`Featured`, media type, release year, star rating) from above the title logo / display typography.
  2. Moved the metadata badges row down into the action button row, placed immediately next to `Watch Now` and `Details`.
  3. Relocated the glass carousel navigation controls (next/prev chevrons + liquid progress pills) to the bottom-right corner of the hero banner stage across `content-container-fullbleed` via responsive flex row (`flex flex-col md:flex-row md:items-end md:justify-between`).
- Files: `src/features/media/components/hero-banner.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled). No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Replaced hero banner carousel progress dots with a miniature landscape thumbnail preview strip matching the Bingr reference:
  1. Replaced the capsule containing progress dots with a sleek thumbnail strip showing landscape backdrop preview cards (`aspect-[16/10]` using `backdropUrl(s.backdropPath ?? s.posterPath, "w300")`).
  2. Active card styling: distinctive bright white rounded border (`ring-2 ring-white ring-offset-2 ring-offset-black/80 rounded-lg scale-105 z-10 opacity-100 shadow-xl shadow-black/80`).
  3. Inactive cards styling: dimmed and smoothly reactive (`opacity-40 hover:opacity-85 hover:scale-[1.02] transition-all rounded-lg overflow-hidden`).
  4. Flanked by subtle chevron navigation arrows (`<` and `>`) on either side.
  5. Smooth auto-advance timer every 6s, pausing on mouse hover (`onMouseEnter`/`onMouseLeave`).
  6. Added automatic smooth scroll-into-view for active thumbnails when strip overflows (`thumbStripRef` with `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })`).
- Files: `src/features/media/components/hero-banner.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled). No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Redesigned HeroBanner action buttons per Bingr reference and removed blue accents globally:
  1. HeroBanner Buttons: Replaced "Watch Now" and "Details" with a circular pure white play button (`rounded-full bg-white text-black shadow-xl hover:scale-105 active:scale-95` with `<Play className="fill-black text-black ml-0.5" />`) and a pill-shaped "See More" button (`rounded-full border border-white/25 bg-black/45 hover:bg-white/15 px-6 py-3.5 text-white font-semibold` with `<Info className="h-5 w-5" />`).
  2. "Featured" badge: Removed blue background and border (`border-primary/40 bg-primary/20 text-primary`), replaced with crisp monochrome glass (`border-white/20 bg-white/10 text-white`).
  3. Global Blue Removal: Updated design system tokens in `src/app/globals.css` from vivid blue (`210 100% 56%`) to clean monochrome white/silver (`--primary: 0 0% 98%`, `--primary-foreground: 0 0% 5%`, `--nav-active: 0 0% 20%`, `--accent: 0 0% 13%`, `--ring: 0 0% 90%`).
  4. Stream Buttons: Replaced blue `rgba(29,144,245,...)` shadows and borders in `src/features/streaming/components/stream-button.tsx` with clean monochrome/glass styling.
  5. Sidebar: Removed cyan/blue/indigo caustic blooms in `src/components/layout/sidebar.tsx` in favor of crystalline neutral glass.
  6. Landing & Showcase: Neutralized `--electric`, `.text-silver`, `.lx-art`, and `FALLBACK_HUES` in `src/features/marketing/showcase.ts` to clean monochrome.
- Files: `src/features/media/components/hero-banner.tsx`, `src/app/globals.css`, `src/components/layout/sidebar.tsx`, `src/features/streaming/components/stream-button.tsx`, `src/features/marketing/showcase.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled). No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Streamlined poster card hover quick actions (`src/features/media/components/poster-card.tsx`):
  1. Removed the redundant "Watching" and "Completed" buttons from the hover action overlay.
  2. Kept exactly two buttons:
     - Top button: prominent white **Play** button (`bg-white text-black hover:bg-white/90 shadow-md active:scale-[0.97]`) with a solid black play icon (`<Play className="fill-black text-black ml-0.5" />`). Directly navigates to media page while recording status.
     - Bottom button: dark **Plan to Watch** button (`bg-black/80 text-white ring-1 ring-white/15 hover:bg-black/95 active:scale-[0.97]`) with bookmark icon.
- Files: `src/features/media/components/poster-card.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled). No git push performed.

## 2026-09-20 | Paarth | Gemini
- Changed: Translucent frosted glass buttons, Continue Watching direct resume, Profile page cleanup, and centered sidebar icons:
  1. Translucent Frosted Glass Quick Action Buttons: Updated `actionBtnClass` and hover buttons in `src/features/media/components/poster-card.tsx` with `backdrop-blur-xl`, `bg-white/75`, `bg-black/50`, specular borders, and inset box shadows for a frosty glass look.
  2. Direct Playback Resume on Continue Watching: Added `onCardClick` prop to `LibraryPosterCard` in `src/features/library/components/library-poster-card.tsx`, and connected it in `src/features/library/components/continue-watching-rail.tsx` to directly open `StreamingTheaterModal` with the media's resume progress.
  3. Profile Page Cleanup: Removed "Insights" and "Activity" sections and their unused dependencies (`InsightCards`, `formatRelativeDate`) from `src/app/(app)/dashboard/page.tsx`.
  4. Centered Sidebar Icons: In `src/components/layout/sidebar.tsx`, updated `NavRow` to render a 40x40px (`w-10 h-10`) centered square button when collapsed, strictly hiding label text and centering icons and container horizontally on the 64px rail.
- Files: `src/features/media/components/poster-card.tsx`, `src/features/library/components/library-poster-card.tsx`, `src/features/library/components/continue-watching-rail.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/components/layout/sidebar.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled).

## 2026-09-20 | Paarth | Gemini
- Changed: Enabled direct playback on Poster Card hover Play button and Hero Banner circular Play button:
  1. Poster Card (`src/features/media/components/poster-card.tsx`): Updated the hover Play button to directly launch `StreamingTheaterModal` with the media's resume timestamp (episode/season for TV, minute progress for film) and automatically set library status to "watching", eliminating the detour to the details page.
  2. Hero Banner (`src/features/media/components/hero-banner.tsx`): Updated the circular white Play button to directly trigger `StreamingTheaterModal` with resume progress, while keeping the "See More" button for navigating to the title's details page.
- Files: `src/features/media/components/poster-card.tsx`, `src/features/media/components/hero-banner.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified locally on `main` branch. `npm run lint` passed (0 errors, 9 warnings), `npm run build` passed (41/41 routes compiled).

## 2026-09-20 | Paarth | Antigravity
- Changed: Restored elegant liquid progress timer pill to Hero Banner carousel and removed thumbnail tiles:
  1. Hero Banner Carousel Controls (`src/features/media/components/hero-banner.tsx`): Removed the landscape thumbnail preview strip and replaced it with a luxury frosted glass carousel pill capsule featuring chevron navigation buttons and a liquid timer progress bar.
  2. Progress Animation (`src/app/globals.css`): Added `@keyframes heroProgress` smoothly filling from 0% to 100% over the carousel duration, with automatic pause on hover.
  3. Monochrome Design Integrity: Applied pure white/silver frosted glass aesthetic matching the current design system (`bg-white/20` track, `bg-white` fill with white specular glow, `backdrop-blur-xl`).
- Files: `src/features/media/components/hero-banner.tsx`, `src/app/globals.css`, `AGENTS.md`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified via `npx tsc --noEmit` (0 errors).

## 2026-09-20 | Paarth | Antigravity
- Changed: Fixed runaway Supabase egress bandwidth (6.61 GB used / 5 GB free plan quota) without touching database schema or altering any UI/playback functionality:
  1. Root Cause 1 (Streaming auth storm): In `src/proxy.ts` and `src/lib/supabase/middleware.ts`, excluded `/api/stream/*` routes from proxy matcher and middleware checks so video chunk proxying (`/api/stream/hls`) and subtitles never trigger `supabase.auth.getUser()`, saving thousands of redundant round-trip auth requests per watched movie/episode.
  2. Root Cause 2 (Duplicate session lookups): In `src/lib/services/user-service.ts`, wrapped `getCurrentUser`, `getProfile`, `getUserSettings`, `getUserPreferences`, and `getSessionContext` in React `cache()`, completely deduplicating lookups between layouts and pages within each request cycle.
  3. Root Cause 3 (Progress revalidation storm): In `src/features/library/actions/library-actions.ts`, stopped `actionSetMovieProgress` and `actionSetTvProgress` from calling full-site `revalidateLibrary` (8 server routes) every 60 seconds of playback, switching to targeted title path revalidation.
  4. Root Cause 4 (Heavy intelligence payload): In `src/lib/intelligence/load-profile.ts`, wrapped `loadIntelligenceData` in React `cache()` and bounded extreme table limits (10,000 episode rows and 5,000 session rows to bounded limits), slashing payload transfer on `/dashboard` and detail pages.
- Files: `src/proxy.ts`, `src/lib/supabase/middleware.ts`, `src/lib/services/user-service.ts`, `src/features/library/actions/library-actions.ts`, `src/lib/intelligence/load-profile.ts`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Verified on `main` branch. `npm run typecheck` passed (0 errors), `npm run test` passed (19/19 files, 209 tests passed), `npm run lint` passed (0 errors, 9 warnings), `npm run build` compiled all 41 routes cleanly.

## 2026-09-20 | Paarth | Antigravity
- Changed: Diagnosed and documented Vercel Fast Origin Transfer spike (6.84 GB used / 10 GB Hobby plan quota):
  1. Metric Definition: Vercel "Fast Origin Transfer" measures bandwidth between Vercel Edge CDN and Vercel Compute (Serverless Functions).
  2. Root Cause: Erasmus relays high-definition HLS video segments through the `/api/stream/hls` serverless function. Streaming 2-3 movies transferred 1.98 GB incoming and 4.87 GB outgoing through Vercel compute.
  3. Empirical Investigation: Extracted a live VidFast stream for Interstellar (`tmdbId: 157336`, server: Lisbon) and tested CDN segments (`quietnexus.top`, `moon.quietridge.top`). Confirmed that upstream CDNs mandate `Referer: https://vidfast.vc/` for every `.m4s`/`.ts` video segment. Requests without the referer fail immediately with HTTP `403 Forbidden`. Because browser JavaScript cannot spoof custom `Referer` headers, an intermediary relay server is required.
  4. Zero-Risk Fix Designed: To avoid breaking the existing player, Hls.js logic, or provider rankings, the relay proxy logic can be offloaded to a standalone Cloudflare Worker (unlimited free bandwidth, 100k requests/day free). This drops Vercel Fast Origin Transfer to 0 GB while keeping all Erasmus player code 100% identical and intact.
- Files: `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: Live tests verified with curl/node. Current quota remaining: ~3.16 GB. Streaming/playback code left completely intact and working.

## 2026-09-20 | Paarth | Antigravity
- Changed: Set Discover (`/discover`) as the primary main home page and default redirect target across the web app instead of `/dashboard`:
  1. Default Landing & Marketing: In `src/app/(marketing)/page.tsx`, updated `LandingPage` so signed-in visitors hitting `/` redirect directly to `ROUTES.discover`. In `src/components/layout/marketing-header.tsx`, updated "Open app" CTA to link to `ROUTES.discover`.
  2. Auth Redirects & Fallbacks: In `src/lib/utils/safe-redirect.ts`, changed `DEFAULT_PATH` fallback to `ROUTES.discover`. In `src/lib/supabase/middleware.ts`, updated authenticated user redirection on `/login` and `/signup` to `ROUTES.discover`. In `src/features/auth/actions/auth-actions.ts`, updated `signInWithPassword` and `signUpWithPassword` default redirects to `ROUTES.discover`. In `src/features/auth/components/login-form.tsx`, set default `next` parameter to `ROUTES.discover`. In `src/app/auth/callback/route.ts`, set OAuth callback fallback to `ROUTES.discover`. In `src/lib/services/user-service.ts`, set `default_landing` to `"/discover"`.
  3. Brand Logo & Layout: In `src/components/layout/logo.tsx`, set default `href` prop to `ROUTES.discover`. In `src/components/layout/app-header.tsx` and `src/components/layout/mobile-nav.tsx`, updated `isHomeScreen` check to match `ROUTES.discover`, rendering the Erasmus logo mark on the Discover page.
  4. Utility & Error Pages: In `src/app/not-found.tsx`, `src/app/offline/page.tsx`, and `src/app/error.tsx`, updated default recovery and retry navigation buttons to `ROUTES.discover`. In `src/constants/shortcuts.ts`, clarified `g d` description to "Go to Dashboard". Updated `docs/architecture.md` routing table and auth flow.
- Files: `src/app/(marketing)/page.tsx`, `src/components/layout/marketing-header.tsx`, `src/lib/utils/safe-redirect.ts`, `src/lib/utils/safe-redirect.test.ts`, `src/lib/supabase/middleware.ts`, `src/features/auth/actions/auth-actions.ts`, `src/features/auth/components/login-form.tsx`, `src/app/auth/callback/route.ts`, `src/lib/services/user-service.ts`, `src/components/layout/logo.tsx`, `src/components/layout/app-header.tsx`, `src/components/layout/mobile-nav.tsx`, `src/constants/shortcuts.ts`, `src/app/not-found.tsx`, `src/app/offline/page.tsx`, `src/app/error.tsx`, `docs/architecture.md`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: 209/209 tests passed (`npm run test`), 0 type errors (`npm run typecheck`), 0 lint errors (`npm run lint`), 41/41 routes built cleanly (`npm run build`).

## 2026-09-21 | Paarth | Antigravity
- Changed: Configured the website typeface to Instrument Sans using the user-provided font package (`/Users/paarthsharma/Downloads/instrument-sans.zip`):
  1. Extracted `InstrumentSans-Variable.ttf` and `InstrumentSans-Italic-Variable.ttf` into `src/assets/fonts/instrument-sans/`.
  2. Created `src/lib/fonts/instrument-sans.ts` to configure `instrumentSans` using Next.js `next/font/local` with variable font support for normal and italic styles.
  3. In `src/app/layout.tsx`, replaced Google Fonts `Source_Sans_3` with `instrumentSans`, applying `${instrumentSans.variable}` to the root `<html>` element. Kept `Geist_Mono` for `--font-mono`.
  4. In `src/app/globals.css`, updated `--font-sans` and `--font-display` to use `var(--font-instrument-sans), "Instrument Sans", ui-sans-serif, system-ui, sans-serif;`, applying Instrument Sans across all headings, titles, navigation, buttons, and prose.
- Files: `src/assets/fonts/instrument-sans/InstrumentSans-Variable.ttf`, `src/assets/fonts/instrument-sans/InstrumentSans-Italic-Variable.ttf`, `src/lib/fonts/instrument-sans.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: 0 lint errors (`npm run lint`), 0 type errors (`npm run typecheck`), 209/209 tests passed (`npm run test`), 41/41 routes compiled cleanly (`npm run build`).

## 2026-09-21 | Paarth | Antigravity
- Changed: Defaulted video playback to highest available quality tier (4K or 1080p, never Auto) per user directive:
  1. `StreamingTheaterModal` (`src/features/streaming/components/streaming-theater-modal.tsx`): Prioritized `fourKUrl` as direct source (`resolvedFourK`) over standard HD direct src when available from `/api/stream/direct`.
  2. `NativePlayer` (`src/features/streaming/components/native-player.tsx`):
     - Initialized `activeSrc` to `fourKSrc` if available.
     - Initialized `selectedQualityTier` state to `"4k"` (if 4K stream or hint is present) or `"1080p"`, never `"auto"`.
     - In `Hls.Events.MANIFEST_PARSED`: Replaced default auto ABR (`hls.currentLevel = -1; setSelectedQualityTier("auto")`) with logic that inspects all parsed playlist levels, finds the highest resolution/bitrate level index (`topIdx`), sets `hls.currentLevel = topIdx`, sets `level = topIdx`, and syncs `selectedQualityTier` to `"4k"` or `"1080p"` (or highest available tier).
     - In `Hls.Events.LEVEL_SWITCHED`: Synced `selectedQualityTier` to the switched level's dimensions.
     - In Safari native HLS & direct file playback: Added `loadedmetadata` inspection to lock `selectedQualityTier` to 4K or 1080p.
     - In `selectQualityTier`: Removed automatic reset to `-1` (Auto) when toggling 4K/HD streams so user stays on explicit tier. "Auto" remains selectable in the UI menu if desired.
     - Refactored `checkIs4KSource` and `checkIs1080pSource` to module-level pure functions to comply with React 19 Compiler hook dependencies.
- Files: `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `docs/ai/STATE.md`, `docs/ai/LOG.md`.
- Result: 0 lint errors (`npm run lint`), 0 type errors (`npm run typecheck`), 209/209 tests passed (`npm run test`), 41/41 routes compiled cleanly (`npm run build`).



## 2026-09-21 | Paarth | Antigravity
- Changed: Added witty loading jokes to the "Starting playback" screen in `StreamingTheaterModal`:
  1. Created `LOADING_JOKES` constant (50 entries) and `useLoadingJoke` cycling hook in `native-player.tsx`. Hook picks a random joke and cycles every 4 seconds with a 400ms CSS fade transition while the loading state is active.
  2. Integrated joke cycling into `StreamingTheaterModal` loading overlay (replaces static "Starting playback" text) and into `NativePlayer` buffering spinner overlay.
  3. User-supplied additional jokes across 7 categories: Director/Cinema, Binge-Watching, Classic Movie Line Parodies, Purist Tech Humor, Pirate/Nautical, Tech/Meta, Audience Teasing.
- Files: `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`.
- Result: 0 lint errors, 0 type errors.

## 2026-09-21 | Paarth | Antigravity
- Changed: Refactored loading joke system per user spec — one static joke per session, shimmer animation, no mid-video joke:
  1. Replaced cycling `useLoadingJoke` hook with `pickLoadingJoke()` — picks one random joke once per modal open, never cycles.
  2. Joke shown only during initial "Starting playback" loading phase (`!directSrc && !embedSrc && open`). Disappears the moment the stream URL resolves. Zero joke during mid-video buffering (scrubbing, seeking, rebuffering) — plain spinner only.
  3. Removed "Starting playback" label. Joke is now the sole loading indicator text, sized at 17.5px.
  4. Added `@keyframes joke-shimmer-sweep` and `.joke-shimmer` CSS class to `globals.css`: correctly calculated `background-position: 200% → -100%` with `background-size: 200%` produces a genuine left-to-right brightness glint sweep through the static letters using `background-clip: text`.
- Files: `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`, `src/app/globals.css`.
- Result: 0 lint errors, 0 type errors.

## 2026-09-21 | Paarth | Antigravity
- Changed: Expanded loading jokes to 200 total, categorized by media type, and wired `mediaType` prop to joke picker:
  1. Restructured `LOADING_JOKES` from `readonly string[]` to `readonly { text: string; for: "movie" | "tv" | "both" }[]` with 74 "both", 61 "movie", and 65 "tv" entries.
  2. Added 150 new jokes across all three pools: director references (Kubrick, Lynch, Wes Anderson, Bay, Burton, Cameron, Spielberg, Scott, Jackson, Coens), cinema culture, sequels/reboots, genre-specific (horror, heist, romance, thriller), awards/prestige cinema, skip intro/are-you-still-watching, cancelled shows/cliffhangers, character deaths, showrunner drama, binge-watching episode culture, spin-offs, streaming-specific TV, episode runtime humor, TV tropes, quote parodies (Fight Club, Dirty Dancing, A Few Good Men, etc.), server/CDN meta-humor, audience meta-humor, purist/technical, and pirate/heist vibe.
  3. Updated `pickLoadingJoke(mediaType?: "movie" | "tv")` to filter the pool — movies draw from 135 jokes (movie + both), TV draws from 139 jokes (tv + both).
  4. `StreamingTheaterModal` now passes its `mediaType` prop into both `pickLoadingJoke` calls (initial state and `useEffect([open, mediaType])`).
- Files: `src/features/streaming/components/native-player.tsx`, `src/features/streaming/components/streaming-theater-modal.tsx`.
- Result: 0 lint errors, 0 type errors.
