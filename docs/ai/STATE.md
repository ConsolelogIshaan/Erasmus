# STATE

Updated: 2026-09-20
Git: local branch `main`

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Supabase Egress & Bandwidth Optimization:
  - Bypassed Next.js middleware (`src/proxy.ts` and `src/lib/supabase/middleware.ts`) for `/api/stream/*` routes so HLS video chunks and subtitle fetches never trigger `supabase.auth.getUser()`, eliminating thousands of round-trip auth calls per streamed title.
  - Wrapped user session and profile getters (`getCurrentUser`, `getProfile`, `getUserSettings`, `getUserPreferences`, `getSessionContext`) in React `cache()` in `src/lib/services/user-service.ts`, deduplicating queries within each request render cycle.
  - Targeted playback progress revalidations in `actionSetMovieProgress` and `actionSetTvProgress` (`src/features/library/actions/library-actions.ts`) to specific media paths instead of triggering full-site revalidation (`revalidateLibrary`) every 60 seconds of playback.
  - Wrapped `loadIntelligenceData` in React `cache()` and pruned excessive table query limits (reducing 10,000 episode rows and 5,000 session rows to bounded limits), slashing payload transfer on `/dashboard` and detail pages.
- Direct Playback Trigger on Poster Cards & Hero Banner:
  - Poster Card Quick Actions (`src/features/media/components/poster-card.tsx`): Clicking the hover **Play** button now directly opens `StreamingTheaterModal` with the title's resume progress point instead of navigating away to the details page, while also marking status to "watching".
  - Hero Banner Action Buttons (`src/features/media/components/hero-banner.tsx`): Clicking the circular white **Play** button directly opens `StreamingTheaterModal`, while the pill "See More" button navigates to the title's detail page.
- Translucent Frosted Glass Quick Action Buttons on Poster Cards (`src/features/media/components/poster-card.tsx`):
  - Updated action button styling with `backdrop-blur-xl`, semi-transparency, and specular inset highlights.
- Instant Direct Playback Resume on Continue Watching Click (`continue-watching-rail.tsx` & `library-poster-card.tsx`):
  - Clicking any card in the Continue Watching row now directly triggers playback via `StreamingTheaterModal` with zero detour to the details page.
- Centered Navigation Icons on Collapsed Sidebar (`src/components/layout/sidebar.tsx`):
  - In `NavRow`, when collapsed, row links become a 40x40px (`w-10 h-10`) centered square container with the icon dead-centered, eliminating label whitespace.
- Clean Monochrome Palette & Complete Removal of Blue Accents.
- Verification: 209/209 tests passed (`npm run test`), 0 type errors (`npm run typecheck`), 0 lint errors (`npm run lint`), 41/41 routes compiled cleanly (`npm run build`).

## Broken / Risky
- Full video traffic still passes through Vercel via `/api/stream/hls` for non-passthrough CDNs (bandwidth problem).
- Desktop Chrome/Firefox direct HLS requests can hit upstream CDN CORS restrictions.
- Profile integration with Supabase `watch_profiles` (used by the TV app) caused playback problems and was reverted. Do not touch Supabase settings or schema.
- Proxy and resolver disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`) for upstream CDN nodes.

## In progress
- Complete: Resolved Supabase egress bandwidth overages across middleware, user session caching, intelligence query limits, and playback progress revalidation.

## Next
- Monitor Supabase billing/usage dashboard to observe egress dropping to near zero.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
