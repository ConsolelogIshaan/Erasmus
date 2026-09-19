import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { HeroBanner } from "@/features/media/components/hero-banner";
import { MediaRow } from "@/features/media/components/media-row";
import { GenreChips } from "@/features/media/components/genre-chips";
import { MediaGrid } from "@/features/media/components/media-grid";
import { FilterBar } from "@/features/media/components/filter-bar";
import { ImdbTopGrid } from "@/features/media/components/imdb-top-grid";
import { PaginationControls } from "@/features/media/components/pagination-controls";
import { CatalogConfigBanner } from "@/features/media/components/catalog-config-banner";
import { PageLoader } from "@/components/feedback/page-loader";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  discoverMovies,
  getMovieGenres,
  isCatalogConfigured,
  safeGetMoviesDiscoveryHome,
} from "@/lib/media/catalog";
import { getMediaProvider } from "@/lib/media/providers";
import { parseDiscoverFilters } from "@/lib/media/filters";
import { getImdbTopRated, PAGE_SIZE } from "@/lib/media/imdb-top";
import { extractAmbientColors } from "@/lib/media/ambient-colors";
import { backdropUrl } from "@/lib/media/image";

export const metadata: Metadata = {
  title: "Movies",
  description: "Explore trending, popular, and acclaimed films on Erasmus",
};

export const revalidate = 900;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Premium Movies Page — Mirrors the Discover page layout with an immersive hero,
 * genre chips, and curated cinematic rows, while supporting full catalog filtering.
 */
export default async function MoviesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const configured = isCatalogConfigured();

  if (!configured) {
    return (
      <div className="content-container-fullbleed pt-[calc(var(--header-height)+1.5rem)]">
        <CatalogConfigBanner />
      </div>
    );
  }

  const section = typeof params.section === "string" ? params.section : undefined;
  const pageParam = typeof params.page === "string" ? Number(params.page) || 1 : 1;
  const hasFilters = Boolean(
    params.genre ||
      params.year ||
      params.rating ||
      params.runtime ||
      params.language ||
      params.sort ||
      params.explore === "true" ||
      section ||
      pageParam > 1,
  );

  const flatParams: Record<string, string | undefined> = {};
  Object.entries(params).forEach(([k, v]) => {
    flatParams[k] = Array.isArray(v) ? v[0] : v;
  });

  // If user applied search/filter/pagination or clicked Explore, render the direct explorer view without hero
  if (hasFilters) {
    const genres = await getMovieGenres();

    if (section === "top_rated") {
      const top = await getImdbTopRated("movie", pageParam);
      return (
        <div className="relative w-full min-h-dvh">
          <h1 className="sr-only">Top Rated Movies</h1>

          <div className="content-container-fullbleed space-y-8 pb-16 pt-[calc(var(--header-height)+1.5rem)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-section-title">Top Rated Movies</h2>
                <p className="text-meta mt-1 text-muted-foreground">
                  {top.imdbEnabled
                    ? "The highest-rated films in cinema history, ordered by IMDb score."
                    : "The highest-rated films ordered by audience ratings."}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/movies">Back to Movies Showcase</Link>
              </Button>
            </div>

            <ImdbTopGrid
              items={top.items}
              startRank={(top.page - 1) * PAGE_SIZE + 1}
              imdbEnabled={top.imdbEnabled}
            />
            <PaginationControls
              page={top.page}
              totalPages={top.totalPages}
              basePath="/movies"
              searchParams={flatParams}
            />
          </div>
        </div>
      );
    }

    const filters = parseDiscoverFilters(params, { mediaType: "movie" });
    const provider = getMediaProvider();

    let result = {
      page: 1,
      totalPages: 0,
      totalResults: 0,
      results: [] as Awaited<ReturnType<typeof discoverMovies>>["results"],
    };
    let loadError: string | null = null;

    try {
      if (section === "now_playing") {
        result = await provider.getNowPlayingMovies(filters.page);
      } else if (section === "upcoming") {
        result = await provider.getUpcomingMovies(filters.page);
      } else {
        result = await discoverMovies(filters);
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Failed to load movies";
    }

    return (
      <div className="relative w-full min-h-dvh">
        <h1 className="sr-only">Movies Catalog</h1>

        <div className="content-container-fullbleed space-y-8 pb-16 pt-[calc(var(--header-height)+1.5rem)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-section-title">Explore Movies</h2>
              <p className="text-meta mt-1 text-muted-foreground">
                Filter by genre, release year, runtime, rating, and language.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/movies">Back to Movies Showcase</Link>
            </Button>
          </div>

          <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}>
            <FilterBar genres={genres} showRuntime />
          </Suspense>

          {loadError ? (
            <p className="text-destructive text-sm" role="alert">
              {loadError}
            </p>
          ) : null}

          <MediaGrid items={result.results} />
          <PaginationControls
            page={result.page}
            totalPages={result.totalPages}
            basePath="/movies"
            searchParams={flatParams}
          />
        </div>
      </div>
    );
  }

  // Default view: Exact Discover Page layout with curated movie rows & hero banner
  const discoveryData = await safeGetMoviesDiscoveryHome();

  const rawHeroItems =
    discoveryData.heroItems?.length > 0
      ? discoveryData.heroItems
      : discoveryData.hero
        ? [discoveryData.hero]
        : [];

  const heroItems = await Promise.all(
    rawHeroItems.map(async (item) => {
      const imgPath = item.backdropPath ?? item.posterPath;
      const palette = await extractAmbientColors(imgPath);
      const backdrop = backdropUrl(imgPath, "w1280");
      return {
        ...item,
        ambientPalette: palette,
        ambientBackdropUrl: backdrop,
      };
    }),
  );

  return (
    <div className="relative w-full min-h-dvh">
      <h1 className="sr-only">Movies — Curated films and cinema on Erasmus</h1>

      {"error" in discoveryData && discoveryData.error ? (
        <div className="content-container-fullbleed pt-[calc(var(--header-height)+1.5rem)]">
          <div
            className="animate-fade-up rounded-xl border-0 bg-destructive/12 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <p className="font-medium">Catalog temporarily unavailable</p>
            <p className="mt-1 text-muted-foreground">{discoveryData.error}</p>
          </div>
        </div>
      ) : null}

      {heroItems.length > 0 ? <HeroBanner items={heroItems} intervalMs={6000} /> : null}

      <div className="content-container-fullbleed space-y-10 pb-16 pt-6">
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}>
          <ScrollReveal delay={0.05}>
            <GenreChips
              genres={discoveryData.genres}
              basePath="/movies"
            />
          </ScrollReveal>
        </Suspense>

        <div className="space-y-10">
          {discoveryData.sections.map((sec, idx) => (
            <MediaRow
              key={sec.id}
              title={sec.title}
              items={sec.items}
              href={sec.href}
              priorityCount={idx === 0 ? 4 : 0}
            />
          ))}
        </div>

        {/* Bottom Catalog Explorer Access */}
        <div className="pt-6 border-t border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Looking for a specific film?</h3>
              <p className="text-sm text-muted-foreground">
                Filter through tens of thousands of movies with custom sort, runtime, and year filters.
              </p>
            </div>
            <Button asChild>
              <Link href="/movies?explore=true">
                <Sparkles className="mr-2 h-4 w-4" />
                Browse All Movies
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MoviesLoading() {
  return <PageLoader />;
}
