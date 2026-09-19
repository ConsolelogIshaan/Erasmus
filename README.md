# Erasmus

> A high-performance, cinematic personal media streaming and tracking web application.

Built with **Next.js 16 (Turbopack)**, **React 19**, **TypeScript**, **Tailwind CSS**, and **Supabase**.

---

## Features

- **Personal Profile & Dashboard (`/dashboard`)**: Unified personal home combining watch habits, viewing streaks, hours watched, series progress, library exploration, analytics charts, and inline profile editing.
- **Cinematic Discovery (`/discover`, `/movies`, `/tv`, `/anime`)**: Full-bleed edge-to-edge browsing with ambient backdrops, immersive rotating hero banners, category genre chips, and infinite catalog filtering.
- **Native HLS Player**: Custom, resilient player with 4K/1080p quality ladders, multi-audio selection, speed controls, subtitles, and browser/OS fullscreen capabilities.
- **Personal Library**: Track movies and series across *Watching*, *Plan to watch*, *Completed*, and *Dropped* states with custom collections, private notes, and reviews.
- **Intelligence & Recaps**: Viewing analytics, favorite genres breakdown, and annual *Wrapped* summaries.
- **Keyboard-First Navigation**: Global shortcuts (`⌘K`, `g d`, `g p`, `g x`, `g a`, etc.) for seamless navigation.

---

## Tech Stack

- **Framework**: Next.js 16.2.10 (Turbopack, App Router)
- **UI & Animation**: React 19, Tailwind CSS, Framer Motion, Lucide Icons, Radix UI primitives
- **Backend & Auth**: Supabase (PostgreSQL, Row-Level Security, `@supabase/ssr`)
- **Metadata APIs**: The Movie Database (TMDB), OMDb
- **Streaming Engine**: Custom direct streaming cluster resolver & HLS proxy relay

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ConsolelogIshaan/Erasmus.git
   cd Erasmus
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   TMDB_API_KEY=your_tmdb_api_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Run linting and production build:
   ```bash
   npm run lint
   npm run build
   ```

---

## Documentation

- [Architecture & Layering](docs/architecture.md)
- [Keyboard Shortcuts](docs/keyboard-shortcuts.md)
- [Personal Library](docs/library.md)
- [Coding Standards](docs/coding-standards.md)
- [Current AI State & Log](docs/ai/STATE.md)
