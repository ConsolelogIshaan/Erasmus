import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { HeroBanner } from "@/features/media/components/hero-banner";
import { MediaRow } from "@/features/media/components/media-row";
import { GenreChips } from "@/features/media/components/genre-chips";
import { MediaGrid } from "@/features/media/components/media-grid";
import { FilterBar } from "@/features/media/components/filter-bar";
import { PaginationControls } from "@/features/media/components/pagination-controls";
import { CatalogConfigBanner } from "@/features/media/components/catalog-config-banner";
import { PageLoader } from "@/components/feedback/page-loader";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { isCatalogConfigured } from "@/lib/media/catalog";
import { parseDiscoverFilters } from "@/lib/media/filters";
import {
  discoverAnime,
  getAnimeGenres,
  safeGetAnimeDiscoveryHome,
} from "@/lib/media/anime";
import { extractAmbientColors } from "@/lib/media/ambient-colors";
import { backdropUrl } from "@/lib/media/image";

export const metadata: Metadata = {
  title: "Anime",
  description: "Explore trending, popular, and acclaimed Japanese animation series and films on Erasmus",
};

export const revalidate = 900;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Premium Anime Page — Mirrors the Discover page layout with an immersive hero,
 * anime sub-genre chips, and curated anime rows, unlocking all 11,400+ titles from the API.
 */
export default async function AnimeBrowsePage({ searchParams }: PageProps) {
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
      params.language ||
      params.sort ||
      params.type ||
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
    const isFilms = params.type === "movie" || section === "movies";
    const isTopRated = section === "top_rated";
    const activeType: "tv" | "movie" = isFilms ? "movie" : "tv";

    const [genres, filters] = await Promise.all([
      getAnimeGenres(activeType),
      Promise.resolve(
        parseDiscoverFilters(params, {
          mediaType: activeType,
          voteCountGte: isTopRated ? 30 : 0,
          sortBy: isTopRated ? "vote_average.desc" : "popularity.desc",
        })
      ),
    ]);

    let result = {
      page: 1,
      totalPages: 0,
      totalResults: 0,
      results: [] as Awaited<ReturnType<typeof discoverAnime>>["results"],
    };
    let loadError: string | null = null;

    try {
      result = await discoverAnime(filters, activeType);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Failed to load anime";
    }

    return (
      <div className="relative w-full min-h-dvh">
        <h1 className="sr-only">Anime Catalog</h1>

        <div className="content-container-fullbleed space-y-8 pb-16 pt-[calc(var(--header-height)+1.5rem)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-section-title">Explore All Anime</h2>
              <p className="text-meta mt-1 text-muted-foreground">
                Showing page {result.page} of {result.totalPages} ({result.totalResults.toLocaleString()} total titles available)
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/anime">Back to Anime Showcase</Link>
            </Button>
          </div>

          <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}>
            <FilterBar genres={genres} />
          </Suspense>

          {loadError ? (
            <p className="text-destructive text-sm" role="alert">
              {loadError}
            </p>
          ) : null}

          <MediaGrid
            items={result.results}
            emptyTitle={isFilms ? "No anime films found" : "No anime shows found"}
          />
          <PaginationControls
            page={result.page}
            totalPages={result.totalPages}
            basePath="/anime"
            searchParams={flatParams}
          />
        </div>
      </div>
    );
  }

  // Default view: Exact Discover Page layout with curated anime rows & hero banner
  const discoveryData = await safeGetAnimeDiscoveryHome();

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

  // Default view: Exact Discover Page layout with curated anime rows & hero banner
  return (
    <div className="relative w-full min-h-dvh">
      <h1 className="sr-only">Anime — Japanese animation series and cinema on Erasmus</h1>

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
              basePath="/anime"
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
              <h3 className="text-lg font-semibold tracking-tight">Looking for all 11,400+ anime titles?</h3>
              <p className="text-sm text-muted-foreground">
                Browse through every Japanese animation series, OVA, and film provided by the catalog with custom filters.
              </p>
            </div>
            <Button asChild>
              <Link href="/anime?explore=true">
                <Sparkles className="mr-2 h-4 w-4" />
                Browse All Anime
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnimeLoading() {
  return <PageLoader />;
}
