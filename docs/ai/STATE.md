# STATE

Updated: 2026-09-20
Git: local branch `main`

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Direct Playback Trigger on Poster Cards & Hero Banner:
  - Poster Card Quick Actions (`src/features/media/components/poster-card.tsx`): Clicking the hover **Play** button now directly opens `StreamingTheaterModal` with the title's resume progress point instead of navigating away to the details page, while also marking status to "watching".
  - Hero Banner Action Buttons (`src/features/media/components/hero-banner.tsx`): Clicking the circular white **Play** button directly opens `StreamingTheaterModal`, while the pill "See More" button navigates to the title's detail page.
- Translucent Frosted Glass Quick Action Buttons on Poster Cards (`src/features/media/components/poster-card.tsx`):
  - Updated action button styling with `backdrop-blur-xl`, semi-transparency, and specular inset highlights:
    1. Top button: translucent white frosted **Play** button (`bg-white/75 hover:bg-white/90 text-black border border-white/60 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.85)] active:scale-[0.97]`).
    2. Bottom button: translucent dark frosted **Plan to Watch** button (`bg-black/50 hover:bg-black/70 text-white border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.15)] active:scale-[0.97]`).
- Instant Direct Playback Resume on Continue Watching Click (`continue-watching-rail.tsx` & `library-poster-card.tsx`):
  - Clicking any card in the Continue Watching row now directly triggers playback via `StreamingTheaterModal` with zero detour to the details page.
  - Automatically loads latest playback resume progress (`getTvShowResume` for TV shows and `getPlaybackProgress` for movies), launching Lisbon primary server at the exact timestamp.
  - Retains native link attributes so middle-click or Cmd-click still allows opening the details page in a new tab if desired.
- Profile Page Cleanup (`src/app/(app)/dashboard/page.tsx`):
  - Completely removed the "Insights" section and the "Activity" section per user design feedback.
  - Cleaned up unused component imports (`InsightCards`, `formatRelativeDate`) maintaining 0 lint warnings/errors.
- Centered Navigation Icons on Collapsed Sidebar (`src/components/layout/sidebar.tsx`):
  - In `NavRow`, when collapsed, row links become a 40x40px (`w-10 h-10`) centered square container with the icon dead-centered, eliminating label whitespace.
  - Label text is strictly hidden when collapsed (`collapsed && "hidden"`, `group-data-[collapsed]/rail:hidden`).
  - Container and header toggle button centered horizontally on the 64px rail (`justify-center px-0`).
  - Active and hover states now form a symmetrical square centered on the rail.
- Clean Monochrome Palette & Complete Removal of Blue Accents:
  - System tokens in `src/app/globals.css` updated to pure monochrome silver/white/neutral palette.
  - Removed blue shadows and replaced with crisp white/neutral shadows across stream buttons.
- Verification: Zero lint errors (`npm run lint`), zero build errors (`npm run build` across 41/41 routes).

## Broken / Risky
- Full video traffic still passes through Vercel via `/api/stream/hls` for non-passthrough CDNs (bandwidth problem).
- Desktop Chrome/Firefox direct HLS requests can hit upstream CDN CORS restrictions.
- Profile integration with Supabase `watch_profiles` (used by the TV app) caused playback problems and was reverted. Do not touch Supabase settings or schema.
- Proxy and resolver disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`) for upstream CDN nodes.

## In progress
- Complete: Poster card and hero banner play buttons directly initiate playback via StreamingTheaterModal; verified 0 lint errors, 0 build errors.

## Next
- Await user verification of the updated playback behavior.

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
