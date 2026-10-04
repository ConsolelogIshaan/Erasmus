import "server-only";

import { tmdbFetch } from "@/lib/media/providers/tmdb/client";
import { mapMediaSummary, mapPaginated } from "@/lib/media/providers/tmdb/mappers";
import type {
  TmdbMovieListItem,
  TmdbPaginated,
  TmdbWatchProviders,
} from "@/lib/media/providers/tmdb/types";
import type { MediaSummary, PaginatedResult } from "@/types/media";
import type { Studio, StudioFilters } from "./config";
import { confirmStudioAvailability } from "./availability";

interface StudioCatalogResult extends PaginatedResult<MediaSummary> {
  unconfirmedCount: number;
}

export async function getStudioCatalog(
  studio: Studio,
  filters: StudioFilters,
): Promise<StudioCatalogResult> {
  const directory = await tmdbFetch<{ results: { provider_id: number }[] }>(
    `/watch/providers/${filters.type}`,
    { watch_region: filters.region },
  );
  if (!directory) throw new Error("Service availability directory unavailable");
  const supportedIds = new Set(directory.results.map((provider) => provider.provider_id));
  const providerIds = new Set(studio.providerIds.filter((id) => supportedIds.has(id)));
  if (!providerIds.size) {
    return {
      page: filters.page,
      results: [],
      totalResults: 0,
      totalPages: 0,
      unconfirmedCount: 0,
    };
  }
  const date = new Date().toISOString().slice(0, 10);
  const movie = filters.type === "movie";
  const sort =
    filters.sort === "rating"
      ? "vote_average.desc"
      : filters.sort === "newest"
        ? movie
          ? "primary_release_date.desc"
          : "first_air_date.desc"
        : "popularity.desc";
  const data = await tmdbFetch<TmdbPaginated<TmdbMovieListItem>>(
    `/discover/${filters.type}`,
    {
      page: filters.page,
      sort_by: sort,
      watch_region: filters.region,
      with_watch_providers: Array.from(providerIds).join("|"),
      with_watch_monetization_types: "flatrate|free|ads",
      include_adult: false,
      include_null_first_air_dates: movie ? undefined : false,
      [movie ? "primary_release_date.lte" : "first_air_date.lte"]: date,
      "vote_count.gte": filters.sort === "rating" ? 100 : undefined,
    },
  );
  // A missing upstream response is a load failure, not an empty service catalog.
  if (!data) throw new Error("Service catalog unavailable");
  const verified = await confirmStudioAvailability(
    data.results,
    filters.region,
    providerIds,
    (id) => tmdbFetch<TmdbWatchProviders>(`/${filters.type}/${id}/watch/providers`),
  );
  if (verified.unconfirmedCount && !verified.items.length) {
    throw new Error("Title availability could not be confirmed");
  }
  return {
    ...mapPaginated({ ...data, results: verified.items }, (item) =>
      mapMediaSummary(item, filters.type),
    ),
    unconfirmedCount: verified.unconfirmedCount,
  };
}
