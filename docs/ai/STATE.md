# STATE

Updated: 2026-09-21
Git: local branch `main`

## Priority
Streaming architecture and playback reliability. Reduce Vercel bandwidth from HLS proxying without iframe embeds and without breaking the working player.

## Working
- Web app (Erasmus, Next.js 16 / React 19): catalog, social, recommendations, ratings, ambient lighting, Continue Watching.
- Typography: Instrument Sans Typeface:
  - Configured Instrument Sans (`InstrumentSans-Variable.ttf`, `InstrumentSans-Italic-Variable.ttf`) via `next/font/local` in `src/lib/fonts/instrument-sans.ts`.
  - Replaced Google Fonts `Source_Sans_3` in `src/app/layout.tsx` and `src/app/globals.css`, eliminating external font round-trip requests.
  - Mapped `--font-sans` and `--font-display` to `var(--font-instrument-sans)` for all UI, buttons, body copy, headings, and section titles.
  - Retained `Geist_Mono` exclusively for technical data, badges, and keyboard shortcuts via `--font-mono`.
- Primary Home & Default Landing: Discover (`/discover`):
  - Made Discover the primary home screen and default landing page instead of `/dashboard`.
  - Authenticated visitors to `/` redirect directly to `/discover`.
  - Brand Logo defaults to `/discover`. Header and mobile drawer recognize Discover as the home screen.
  - Auth redirects (login, signup, OAuth callback, fallback) redirect to `/discover`.
  - Error and offline fallbacks default to `/discover`.
  - `/dashboard` remains preserved as the personal Profile & Intelligence dashboard.
- Supabase Egress & Bandwidth Optimization:
  - Bypassed Next.js middleware (`src/proxy.ts` and `src/lib/supabase/middleware.ts`) for `/api/stream/*` routes so HLS video chunks and subtitle fetches never trigger `supabase.auth.getUser()`, eliminating thousands of round-trip auth calls per streamed title.
  - Wrapped user session and profile getters (`getCurrentUser`, `getProfile`, `getUserSettings`, `getUserPreferences`, `getSessionContext`) in React `cache()` in `src/lib/services/user-service.ts`, deduplicating queries within each request render cycle.
  - Targeted playback progress revalidations in `actionSetMovieProgress` and `actionSetTvProgress` (`src/features/library/actions/library-actions.ts`) to specific media paths instead of triggering full-site revalidation (`revalidateLibrary`) every 60 seconds of playback.
  - Wrapped `loadIntelligenceData` in React `cache()` and pruned excessive table query limits (reducing 10,000 episode rows and 5,000 session rows to bounded limits), slashing payload transfer on `/dashboard` and detail pages.
- Direct Playback Trigger on Poster Cards & Hero Banner:
  - Poster Card Quick Actions (`src/features/media/components/poster-card.tsx`): Clicking the hover **Play** button directly opens `StreamingTheaterModal` with the title's resume progress point.
  - Hero Banner Action Buttons (`src/features/media/components/hero-banner.tsx`): Clicking the circular white **Play** button directly opens `StreamingTheaterModal`, while the pill "See More" button navigates to the title's detail page.
- Translucent Frosted Glass Quick Action Buttons on Poster Cards (`src/features/media/components/poster-card.tsx`).
- Instant Direct Playback Resume on Continue Watching Click (`continue-watching-rail.tsx` & `library-poster-card.tsx`).
- Centered Navigation Icons on Collapsed Sidebar (`src/components/layout/sidebar.tsx`).
- Clean Monochrome Palette & Complete Removal of Blue Accents.
- Verification: 209/209 tests passed (`npm run test`), 0 type errors (`npm run typecheck`), 0 lint errors (`npm run lint`), 41/41 routes compiled cleanly (`npm run build`).

## Broken / Risky
- Vercel Fast Origin Transfer at 6.84 GB / 10 GB monthly limit.
  - Root cause empirically verified: Upstream CDNs (`quietnexus.top`, `moon.quietridge.top`) enforce `Referer: https://vidfast.vc/` for all video segments (`.m4s`/`.ts`). Requests without this referer return `403 Forbidden`.
  - Browsers forbid JavaScript from spoofing 3rd party `Referer` headers, necessitating a server-side relay.
  - Because `/api/stream/hls` runs on Vercel Serverless Compute, all video bytes pass through Vercel.
  - Safe fix identified: Cloudflare Worker relay proxy (free tier, unlimited bandwidth, zero code risk to Erasmus player).
- Desktop Chrome/Firefox direct HLS requests hit upstream CDN CORS / Referer restrictions when unproxied.
- Profile integration with Supabase `watch_profiles` (used by the TV app) caused playback problems and was reverted. Do not touch Supabase settings or schema.
- Proxy and resolver disable TLS verification (`NODE_TLS_REJECT_UNAUTHORIZED = "0"`) for upstream CDN nodes.

## In progress
- Complete: Default playback to highest available quality tier (4K or 1080p, never Auto) per user directive across `native-player.tsx` and `streaming-theater-modal.tsx`.
- Complete: Configured Instrument Sans variable typeface across the website from user-provided archive.
- Complete: Set Discover page (`/discover`) as default main page and redirect route across the web platform.
- Complete: Resolved Supabase egress bandwidth overages across middleware, user session caching, intelligence query limits, and playback progress revalidation.
- Complete: Diagnosed Vercel Fast Origin Transfer spike and verified 403 CDN referer restrictions.

## Next
- Monitor Supabase billing/usage dashboard to observe egress dropping to near zero.
- If approved by user, deploy Cloudflare Worker relay to offload HLS video bandwidth from Vercel to Cloudflare (0 GB Vercel transfer).

## Key locations
- Web repo: `/Users/paarthsharma/Developer/GitHub/Erasmus` (branch: `main`)
- Android TV app: `/Users/paarthsharma/Developer/ErasmusTV`
- Verified backups: `c:/Users/Administrator/Documents/BACKUP/stream_fix_backups/`
