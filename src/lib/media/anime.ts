import { discoverMovies, discoverTv, getTvGenres, getMovieGenres } from "./catalog";
import type { Genre, MediaDiscoverFilters, MediaSummary, PaginatedResult } from "@/types/media";

/**
 * Discover anime series or anime films from TMDB.
 * Filtered by Japanese animation (genre ID 16 + original language "ja").
 */
export async function discoverAnime(
  filters: MediaDiscoverFilters,
  mediaType: "tv" | "movie" = "tv",
): Promise<PaginatedResult<MediaSummary>> {
  const genreIds = ["16", ...(filters.genreIds ?? [])].filter(
    (id, index, arr) => arr.indexOf(id) === index,
  );

  const animeFilters: MediaDiscoverFilters = {
    ...filters,
    mediaType,
    genreIds,
    language: filters.language ?? "ja",
    voteCountGte: filters.voteCountGte ?? (filters.sortBy?.startsWith("vote_average") ? 50 : 10),
  };

  if (mediaType === "movie") {
    return discoverMovies(animeFilters);
  }
  return discoverTv(animeFilters);
}

/**
 * Get anime-relevant sub-genres, excluding generic Animation (16) since everything is animated.
 */
export async function getAnimeGenres(mediaType: "tv" | "movie" = "tv"): Promise<Genre[]> {
  const all = mediaType === "movie" ? await getMovieGenres() : await getTvGenres();
  // Filter out the primary Animation tag (16) so users can filter by Action, Fantasy, Sci-Fi, etc.
  return all.filter((g) => String(g.id) !== "16");
}
