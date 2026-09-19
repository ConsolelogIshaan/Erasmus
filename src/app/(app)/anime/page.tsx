import type { Metadata } from "next";
import { Suspense } from "react";

import { MediaGrid } from "@/features/media/components/media-grid";
import { FilterBar } from "@/features/media/components/filter-bar";
import { MediaShelfTabs } from "@/features/media/components/media-shelf-tabs";
import { PaginationControls } from "@/features/media/components/pagination-controls";
import { CatalogConfigBanner } from "@/features/media/components/catalog-config-banner";
import { isCatalogConfigured } from "@/lib/media/catalog";
import { parseDiscoverFilters } from "@/lib/media/filters";
import { discoverAnime, getAnimeGenres } from "@/lib/media/anime";
import type { MediaSummary } from "@/types/media";

export const metadata: Metadata = {
  title: "Anime",
  description: "Browse and stream Japanese animation series and films on Erasmus",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AnimeBrowsePage({ searchParams }: PageProps) {
  const params = await searchParams;

  if (!isCatalogConfigured()) {
    return (
      <div className="space-y-6">
        <Header />
        <CatalogConfigBanner />
      </div>
    );
  }

  const section = typeof params.section === "string" ? params.section : undefined;
  const isFilms = section === "movies";
  const isTopRated = section === "top_rated";
  const activeType: "tv" | "movie" = isFilms ? "movie" : "tv";
  const pageParam = typeof params.page === "string" ? Number(params.page) || 1 : 1;

  const flatParams: Record<string, string | undefined> = {};
  Object.entries(params).forEach(([k, v]) => {
    flatParams[k] = Array.isArray(v) ? v[0] : v;
  });

  const tabs = [
    { label: "Series", href: "/anime", active: !isTopRated && !isFilms },
    {
      label: "Top Rated",
      href: "/anime?section=top_rated",
      active: isTopRated,
    },
    {
      label: "Films",
      href: "/anime?section=movies",
      active: isFilms,
    },
  ];

  const filters = parseDiscoverFilters(params, { mediaType: activeType });
  if (isTopRated) {
    filters.sortBy = "vote_average.desc";
    filters.voteCountGte = 150;
  }
  filters.page = pageParam;

  let genres: Awaited<ReturnType<typeof getAnimeGenres>> = [];
  let result = {
    page: 1,
    totalPages: 0,
    totalResults: 0,
    results: [] as MediaSummary[],
  };
  let loadError: string | null = null;

  try {
    const [g, r] = await Promise.all([
      getAnimeGenres(activeType),
      discoverAnime(filters, activeType),
    ]);
    genres = g;
    result = r;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Failed to load anime";
  }

  return (
    <div className="animate-fade-up space-y-6">
      <Header />
      <MediaShelfTabs tabs={tabs} />
      {loadError ? (
        <p className="text-destructive text-sm" role="alert">
          {loadError}
        </p>
      ) : null}
      <Suspense fallback={null}>
        <FilterBar genres={genres} />
      </Suspense>
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
  );
}

function Header() {
  return (
    <header className="space-y-1">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Anime</h1>
      <p className="text-muted-foreground text-sm">
        Stream legendary sagas, seasonal simulcasts, and animated cinematic masterworks.
      </p>
    </header>
  );
}
