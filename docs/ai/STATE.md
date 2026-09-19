# STATE

Updated: 2026-09-19
Git: local branch `main`

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Merged Homepage & Profile Architecture:
  - Homepage (`/dashboard`) is now merged with the Profile page, titled "Profile", retaining the dominant dashboard intelligence experience (stats, charts, continue watching, library explorer, trending, recommendations) and integrating user profile identity in the header (avatar, @username, bio, member since date) as well as the interactive "Edit profile" card (`ProfileForm`) at the very bottom.
  - Legacy `/profile` route cleanly forwards to `/dashboard` via server-side redirect.
  - Sidebar updated so **Discover** (`/discover`) is the topmost and default navigation item in `MAIN_NAV`.
  - **Profile** (`/dashboard`) is placed as the second-to-last item on the sidebar in `SECONDARY_NAV` directly above Settings.
  - Marketing home page (`/`) redirects authenticated users directly to `/dashboard`.
  - Auth signups and logins default redirect to `/dashboard`.
  - App Logo and user menu "Profile" link route directly to `/dashboard`.
  - Keyboard shortcut `g p` navigates directly to `/dashboard`.
- Full Discover-Style Architecture Across Movies, TV Shows, and Anime:
  - Redesigned **Movies** (`/movies`), **TV Shows** (`/tv`), and **Anime** (`/anime`) pages to mirror the exact Discover page structure.
  - Full-bleed edge-to-edge layout via `isFullBleed` in `AppShell` with ambient backgrounds.
  - Immersive **HeroBanner** on top of each page with rotating featured titles, taglines, ratings, synopsis, and direct Play / More Info actions.
  - Interactive **GenreChips** tailored to each media category.
  - Curated horizontal **`MediaRow`** shelves with smooth carousel scrolling.
  - Full catalog explorer grid with `FilterBar` and `PaginationControls` supporting deep filtering and pagination.
- Uncapped Anime Catalog (11,400+ Titles):
  - Removed default vote-count floor in `anime.ts`, unlocking all 272+ pages of anime series (5,400+ shows) and 301+ pages of anime films (6,000+ films).
- Cleaned Navigation & Sidebar Design:
  - Frosted liquid glass active pill capsule without vertical blue bar.
  - Anime sidebar entry uses custom icon (`public/icons/anime.png`) via CSS mask.
- Clean Native Streaming Identity:
  - External third-party links ("Available on Netflix/Prime") removed.
- Full-viewport Browser Theater Player (`streaming-theater-modal.tsx` & `native-player.tsx`):
  - Edge-to-edge windowed fullscreen within browser viewport (`fixed inset-0`).
  - Native OS fullscreen toggle via Fullscreen button or `f` key.
  - Lisbon set as default primary server (`isPrimary: true`).
- Verification: Zero lint errors (`npm run lint`), zero build errors (`npm run build` across 41/41 routes).

## Broken / Risky
- Full video traffic still passes through Vercel via `/api/stream/hls` for non-passthrough CDNs (bandwidth problem).
- Desktop Chrome/Firefox direct HLS requests can hit upstream CDN CORS restrictions.
- Profile integration with Supabase `watch_profiles` (used by the TV app) caused playback problems and was reverted. Do not touch Supabase settings or schema.
- Proxy and resolver disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`) for upstream CDN nodes.

## In progress
- Homepage and Profile merge complete; verified zero build/lint errors; committed and pushed to origin/main.

## Next
1. Await user feedback on merged Profile dashboard experience.
2. Monitor playback reliability across direct streaming servers.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
