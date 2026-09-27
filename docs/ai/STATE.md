# STATE

Updated: 2026-09-27 11:23 PM IST
Git: `origin/main` (Clean working tree; verified build, lints, and tests; pushed to origin/main per explicit user command)

## Priority
Streaming/playback is frozen and stable (restored to pre-1102 baseline commit `016aedf`). Harmonized the application design language to pair seamlessly with the horizontal floating pill navbar (`ErasmusFloatingNavbar`). Replaced the razor-sharp boxy 2px–3px corner constraints with Apple/Linear-tier subtle rounded corners across design tokens, UI primitives, and media card surfaces.

## Current State
- Streaming and playback: restored to exact known-good pre-1102 baseline (`016aedf`), frozen and untouched.
- UI Design Language: harmonized with floating horizontal pill navbar across globals, primitives, and media cards.

## UI Design Language Harmonization (Completed)
1. **Design System & Radius Hierarchy (`src/app/globals.css`)**:
   - Modernized `--radius-*` tokens from razor 2px–4px overrides to a squircle curve hierarchy: `--radius-xs` (4px), `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-xl` (16px), `--radius-2xl` (20px), `--radius-3xl` (24px), `--radius-full` (9999px).
   - Synchronized `@theme inline` tokens.
   - Updated surface classes (`.surface-card`, `.glass-*`, `.clay-*`, `.lx-card`, `.lx-panel`) with rounded surfaces and hidden overflow.
   - Suppressed pseudo-element L-bracket ticks (`.panel-corner`, `.lx-corner`) to eliminate sharp artifact corners.
2. **UI Primitives (`src/components/ui/*`)**:
   - Buttons: `rounded-md` (8px).
   - Inputs & Key chips: `rounded-md` (8px).
   - Badges: `rounded-full` (pill capsules).
   - Tabs: `rounded-full` (Apple-style segmented control pills).
   - Cards: `rounded-xl` with `corner={false}` default.
3. **Media Surfaces & Overlays**:
   - Hero banner metadata badges: `rounded-full`.
   - Poster card quick-action buttons: `rounded-full`.
   - Poster card rank, rating, and status badges: `rounded-full` / `rounded-br-xl`.
   - Library card favorite/pinned badges: `rounded-full`; progress bar: `rounded-b-xl`.
   - Shelf tabs and friend library filter chips: `rounded-full`.
4. **Floating Navbar Enhancements (`src/components/layout/erasmus-floating-navbar.tsx`)**:
   - Integrated dropdown options ("For You", "Favorites", "Friends") directly into the horizontal floating navbar, removing the "More ▾" dropdown menu.
   - Dynamic active icon display: unselected links show clean typography; the selected page smoothly animates its icon into the pill beside the text using Framer Motion, and automatically collapses when navigating away.

---

## Current Architecture & Status

### Cloudflare Deployment Topology
1. **Account 1 (`shrdsubscriptions@gmail.com`) — Web Application (`erasmus-web`)**:
   * **URL**: [https://erasmus-web.erasmustv.workers.dev](https://erasmus-web.erasmustv.workers.dev)
   * **Role**: Next.js App Router UI, page SSR, catalog discovery, search, TMDB client caching, and user authentication.
   * **Status**: 100% OK.

2. **Account 1 Streaming Relay (`erasmus-hls-relay`)**:
   * **URL**: [https://erasmus-hls-relay.erasmustv.workers.dev](https://erasmus-hls-relay.erasmustv.workers.dev)
   * **Role**: Primary Anycast HLS relay.

3. **Account 2 (`ishaan.jangid1@gmail.com`) — Standby Streaming Relay**:
   * **URL**: [https://erasmus-hls-relay.ishaan-jangid1.workers.dev](https://erasmus-hls-relay.ishaan-jangid1.workers.dev)
   * **Role**: Dedicated 100k daily request pool.

4. **Database & Auth Backend**:
   * **Provider**: Supabase Cloud (`https://jnxflxtizbezqclxfmzc.supabase.co`).

---

## Verification Summary
- `npm run typecheck`: 0 errors.
- `npm run lint`: 0 errors (11 pre-existing warnings).
- `npm run test`: 20/20 test files passed (223/223 tests passed, 100% pass rate).
- `npm run build`: 52/52 routes compiled cleanly.
- Pushed to `origin/main` per explicit user command.
