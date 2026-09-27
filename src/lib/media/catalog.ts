/**
 * High-level catalog service.
 * Features and pages call this layer — not providers or HTTP clients directly.
 */

import { cache } from "react";
import type {
  CollectionDetails,
  DiscoverySection,
  Genre,
  MediaDiscoverFilters,
  MediaSummary,
  MovieDetails,
  PaginatedResult,
  PersonDetails,
  SearchResponse,
  TvDetails,
  TvSeason,
} from "@/types/media";
import { getMediaProvider } from "@/lib/media/providers";
import { isTmdbConfigured } from "@/lib/media/providers/tmdb/client";
import { enrichRatings } from "@/lib/media/ratings";
import { CREDIBILITY_VOTE_FLOOR } from "@/lib/media/filters";

export function isCatalogConfigured(): boolean {
  return isTmdbConfigured();
}

export async function searchCatalog(
  query: string,
  page?: number,
): Promise<SearchResponse> {
  return getMediaProvider().search(query, { page });
}

const itemCache = new Map<string, { at: number; data: unknown }>();
const ITEM_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export const getMovie = cache(async function getMovie(id: string): Promise<MovieDetails | null> {
  const cacheKey = `movie:${id}`;
  const cached = itemCache.get(cacheKey) as { at: number; data: MovieDetails } | undefined;
  if (cached && Date.now() - cached.at < ITEM_CACHE_TTL) {
    return cached.data;
  }
  const movie = await getMediaProvider().getMovie(id);
  if (!movie) return null;
  let ratings = movie.ratings;
  try {
    ratings = await enrichRatings({
      imdbId: movie.imdbId,
      title: movie.title,
      releaseDate: movie.releaseDate,
      mediaType: "movie",
      voteAverage: movie.voteAverage,
      voteCount: movie.voteCount,
    });
  } catch (err) {
    console.warn(`[catalog] ratings enrichment failed for movie ${id}:`, err instanceof Error ? err.message : err);
  }
  const data: MovieDetails = { ...movie, ratings };
  if (itemCache.size > 500) itemCache.clear();
  itemCache.set(cacheKey, { at: Date.now(), data });
  return data;
});

export const getTvShow = cache(async function getTvShow(id: string): Promise<TvDetails | null> {
  const cacheKey = `tv:${id}`;
  const cached = itemCache.get(cacheKey) as { at: number; data: TvDetails } | undefined;
  if (cached && Date.now() - cached.at < ITEM_CACHE_TTL) {
    return cached.data;
  }
  const show = await getMediaProvider().getTvShow(id);
  if (!show) return null;
  let ratings = show.ratings;
  try {
    ratings = await enrichRatings({
      imdbId: show.imdbId,
      title: show.title,
      releaseDate: show.firstAirDate ?? show.releaseDate,
      mediaType: "tv",
      voteAverage: show.voteAverage,
      voteCount: show.voteCount,
    });
  } catch (err) {
    console.warn(`[catalog] ratings enrichment failed for tv ${id}:`, err instanceof Error ? err.message : err);
  }
  const data: TvDetails = { ...show, ratings };
  if (itemCache.size > 500) itemCache.clear();
  itemCache.set(cacheKey, { at: Date.now(), data });
  return data;
});

export const getTvSeason = cache(async function getTvSeason(
  showId: string,
  seasonNumber: number,
): Promise<TvSeason | null> {
  const cacheKey = `season:${showId}:${seasonNumber}`;
  const cached = itemCache.get(cacheKey) as { at: number; data: TvSeason } | undefined;
  if (cached && Date.now() - cached.at < ITEM_CACHE_TTL) {
    return cached.data;
  }
  const data = await getMediaProvider().getTvSeason(showId, seasonNumber);
  if (data) {
    if (itemCache.size > 500) itemCache.clear();
    itemCache.set(cacheKey, { at: Date.now(), data });
  }
  return data;
});

export const getPerson = cache(async function getPerson(id: string): Promise<PersonDetails | null> {
  const cacheKey = `person:${id}`;
  const cached = itemCache.get(cacheKey) as { at: number; data: PersonDetails } | undefined;
  if (cached && Date.now() - cached.at < ITEM_CACHE_TTL) {
    return cached.data;
  }
  const data = await getMediaProvider().getPerson(id);
  if (data) {
    if (itemCache.size > 500) itemCache.clear();
    itemCache.set(cacheKey, { at: Date.now(), data });
  }
  return data;
});

export const getCollection = cache(async function getCollection(id: string): Promise<CollectionDetails | null> {
  return getMediaProvider().getCollection(id);
});

export const getMovieGenres = cache(async function getMovieGenres(): Promise<Genre[]> {
  return getMediaProvider().getMovieGenres();
});

export const getTvGenres = cache(async function getTvGenres(): Promise<Genre[]> {
  return getMediaProvider().getTvGenres();
});

export async function discoverMovies(
  filters: MediaDiscoverFilters,
): Promise<PaginatedResult<MediaSummary>> {
  return getMediaProvider().discoverMovies(filters);
}

export async function discoverTv(
  filters: MediaDiscoverFilters,
): Promise<PaginatedResult<MediaSummary>> {
  return getMediaProvider().discoverTv(filters);
}

const EMPTY_PAGE: PaginatedResult<MediaSummary> = {
  page: 1,
  totalPages: 0,
  totalResults: 0,
  results: [],
};

async function settledPage(
  promise: Promise<PaginatedResult<MediaSummary>>,
  label: string,
): Promise<PaginatedResult<MediaSummary>> {
  try {
    return await promise;
  } catch (error) {
    console.warn(`[catalog] ${label} failed:`, error instanceof Error ? error.message : error);
    return EMPTY_PAGE;
  }
}

async function settledGenres(
  promise: Promise<Genre[]>,
  label: string,
): Promise<Genre[]> {
  try {
    return await promise;
  } catch (error) {
    console.warn(`[catalog] ${label} failed:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Assembles the discovery homepage sections in parallel.
 * Individual rail failures are isolated so one timeout does not blank the page.
 */
export async function getDiscoveryHome(): Promise<{
  hero: MediaSummary | null;
  heroItems: MediaSummary[];
  sections: DiscoverySection[];
  genres: Genre[];
}> {
  const provider = getMediaProvider();

  const [
    trending,
    popularMovies,
    popularTv,
    nowPlaying,
    upcoming,
    topMovies,
    topTv,
    recentMovies,
    movieGenres,
  ] = await Promise.all([
    settledPage(provider.getTrending("all", "day"), "trending"),
    settledPage(provider.getPopularMovies(), "popular-movies"),
    settledPage(provider.getPopularTv(), "popular-tv"),
    settledPage(provider.getNowPlayingMovies(), "now-playing"),
    settledPage(provider.getUpcomingMovies(), "upcoming"),
    settledPage(provider.getTopRatedMovies(), "top-movies"),
    settledPage(provider.getTopRatedTv(), "top-tv"),
    settledPage(
      provider.discoverMovies({
        sortBy: "release_date.desc",
        yearGte: new Date().getFullYear() - 1,
        voteAverageGte: 6,
      }),
      "recent-movies",
    ),
    settledGenres(provider.getMovieGenres(), "movie-genres"),
  ]);

  // Prefer a rotating pool of trending + popular titles for the discover banner
  const heroPool = [
    ...trending.results,
    ...popularMovies.results,
    ...popularTv.results,
  ];
  const seen = new Set<string>();
  const heroItems = heroPool.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 5);

  const hero = heroItems[0] ?? trending.results[0] ?? popularMovies.results[0] ?? null;

  // Soft approach — use top trending items as "Editor's picks" placeholder
  const editorsPicks = [...topMovies.results, ...topTv.results]
    .sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
    .slice(0, 12);

  const sections: DiscoverySection[] = [
    {
      id: "trending",
      title: "Trending Today",
      href: "/discover?section=trending",
      items: trending.results.slice(0, 12),
    },
    {
      id: "popular-movies",
      title: "Popular Movies",
      href: "/movies?sort=popularity.desc",
      items: popularMovies.results.slice(0, 12),
    },
    {
      id: "popular-tv",
      title: "Popular TV Shows",
      href: "/tv?sort=popularity.desc",
      items: popularTv.results.slice(0, 12),
    },
    {
      id: "now-playing",
      title: "Now Playing",
      href: "/movies?section=now_playing",
      items: nowPlaying.results.slice(0, 12),
    },
    {
      id: "upcoming",
      title: "Upcoming Movies",
      href: "/movies?section=upcoming",
      items: upcoming.results.slice(0, 12),
    },
    {
      id: "top-movies",
      title: "Top Rated Movies",
      href: "/movies?sort=vote_average.desc",
      items: topMovies.results.slice(0, 12),
    },
    {
      id: "top-tv",
      title: "Top Rated Shows",
      href: "/tv?sort=vote_average.desc",
      items: topTv.results.slice(0, 12),
    },
    {
      id: "recent",
      title: "Recently Released",
      href: "/movies?sort=release_date.desc",
      items: recentMovies.results.slice(0, 12),
    },
    {
      id: "streaming",
      title: "New on Streaming",
      href: "/discover?section=streaming",
      items: popularMovies.results.slice(2, 14),
    },
    {
      id: "editors",
      title: "Editor's Picks",
      items: editorsPicks,
    },
  ];

  const filled = sections.filter((s) => s.items.length > 0);



  return {
    hero,
    heroItems,
    sections: filled,
    genres: movieGenres,
  };
}

export async function getGenrePage(
  genreId: string,
  mediaType: "movie" | "tv" = "movie",
  filters: MediaDiscoverFilters = {},
): Promise<{
  genre: Genre | null;
  featured: MediaSummary[];
  popular: PaginatedResult<MediaSummary>;
  topRated: PaginatedResult<MediaSummary>;
  newest: PaginatedResult<MediaSummary>;
}> {
  const provider = getMediaProvider();
  const genres =
    mediaType === "movie" ? await provider.getMovieGenres() : await provider.getTvGenres();
  const genre = genres.find((g) => g.id === genreId) ?? null;

  const base: MediaDiscoverFilters = {
    ...filters,
    genreIds: [genreId],
    page: filters.page ?? 1,
  };

  const discover = mediaType === "movie" ? provider.discoverMovies : provider.discoverTv;

  const [popular, topRated, newest] = await Promise.all([
    discover({ ...base, sortBy: "popularity.desc" }),
    discover({
      ...base,
      sortBy: "vote_average.desc",
      voteAverageGte: 7,
      voteCountGte: CREDIBILITY_VOTE_FLOOR.filtered[mediaType],
    }),
    discover({ ...base, sortBy: "release_date.desc" }),
  ]);

  return {
    genre,
    featured: popular.results.slice(0, 6),
    popular,
    topRated,
    newest,
  };
}

let cachedDiscovery: { at: number; data: Awaited<ReturnType<typeof getDiscoveryHome>> } | null = null;
let inFlightDiscovery: Promise<Awaited<ReturnType<typeof getDiscoveryHome>>> | null = null;

let cachedMoviesDiscovery: { at: number; data: Awaited<ReturnType<typeof getMoviesDiscoveryHome>> } | null = null;
let inFlightMovies: Promise<Awaited<ReturnType<typeof getMoviesDiscoveryHome>>> | null = null;

let cachedTvDiscovery: { at: number; data: Awaited<ReturnType<typeof getTvDiscoveryHome>> } | null = null;
let inFlightTv: Promise<Awaited<ReturnType<typeof getTvDiscoveryHome>>> | null = null;

const DISCOVERY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Safe wrapper — returns empty discovery when TMDB is missing (dev without keys). */
export async function safeGetDiscoveryHome() {
  if (!isCatalogConfigured()) {
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: false,
    };
  }
  if (cachedDiscovery && Date.now() - cachedDiscovery.at < DISCOVERY_CACHE_TTL_MS) {
    return { ...cachedDiscovery.data, configured: true };
  }
  if (inFlightDiscovery) {
    try {
      const data = await inFlightDiscovery;
      return { ...data, configured: true };
    } catch {
      // Fall through to retry
    }
  }
  try {
    inFlightDiscovery = getDiscoveryHome();
    const data = await inFlightDiscovery;
    cachedDiscovery = { at: Date.now(), data };
    return { ...data, configured: true };
  } catch (error) {
    console.error("[catalog] discovery home failed", error);
    if (cachedDiscovery?.data) {
      return { ...cachedDiscovery.data, configured: true };
    }
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load catalog",
    };
  } finally {
    inFlightDiscovery = null;
  }
}

/**
 * Assembles the Movies discovery homepage sections mirroring the Discover page.
 */
export async function getMoviesDiscoveryHome(): Promise<{
  hero: MediaSummary | null;
  heroItems: MediaSummary[];
  sections: DiscoverySection[];
  genres: Genre[];
}> {
  const provider = getMediaProvider();

  const [
    trending,
    popular,
    nowPlaying,
    upcoming,
    topRated,
    action,
    scifi,
    comedy,
    horror,
    recent,
    genres,
  ] = await Promise.all([
    settledPage(provider.getTrending("movie", "day"), "trending-movies"),
    settledPage(provider.getPopularMovies(), "popular-movies"),
    settledPage(provider.getNowPlayingMovies(), "now-playing-movies"),
    settledPage(provider.getUpcomingMovies(), "upcoming-movies"),
    settledPage(provider.getTopRatedMovies(), "top-rated-movies"),
    settledPage(
      provider.discoverMovies({ genreIds: ["28"], sortBy: "popularity.desc" }),
      "action-movies",
    ),
    settledPage(
      provider.discoverMovies({ genreIds: ["878"], sortBy: "popularity.desc" }),
      "scifi-movies",
    ),
    settledPage(
      provider.discoverMovies({ genreIds: ["35"], sortBy: "popularity.desc" }),
      "comedy-movies",
    ),
    settledPage(
      provider.discoverMovies({ genreIds: ["27"], sortBy: "popularity.desc" }),
      "horror-movies",
    ),
    settledPage(
      provider.discoverMovies({
        sortBy: "release_date.desc",
        yearGte: new Date().getFullYear() - 1,
        voteAverageGte: 6,
      }),
      "recent-movies",
    ),
    settledGenres(provider.getMovieGenres(), "movie-genres"),
  ]);

  const heroPool = [
    ...popular.results.slice(0, 5),
    ...trending.results.slice(0, 4),
    ...nowPlaying.results.slice(0, 3),
  ];

  const seen = new Set<string>();
  const heroItems = heroPool.filter((item) => {
    const key = `movie:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 5);

  const hero = heroItems[0] ?? popular.results[0] ?? null;

  const sections: DiscoverySection[] = [
    {
      id: "trending-movies",
      title: "Trending Movies",
      href: "/movies?sort=popularity.desc",
      items: trending.results.slice(0, 12),
    },
    {
      id: "now-playing",
      title: "Now Playing in Theaters",
      href: "/movies?section=now_playing",
      items: nowPlaying.results.slice(0, 12),
    },
    {
      id: "popular-movies",
      title: "Popular Movies",
      href: "/movies?sort=popularity.desc",
      items: popular.results.slice(0, 12),
    },
    {
      id: "top-rated-movies",
      title: "Top Rated Films",
      href: "/movies?section=top_rated",
      items: topRated.results.slice(0, 12),
    },
    {
      id: "upcoming-movies",
      title: "Upcoming Blockbusters",
      href: "/movies?section=upcoming",
      items: upcoming.results.slice(0, 12),
    },
    {
      id: "action-movies",
      title: "Action & Adventure",
      href: "/movies?genre=28",
      items: action.results.slice(0, 12),
    },
    {
      id: "scifi-movies",
      title: "Sci-Fi & Fantasy",
      href: "/movies?genre=878",
      items: scifi.results.slice(0, 12),
    },
    {
      id: "comedy-movies",
      title: "Comedy Hits",
      href: "/movies?genre=35",
      items: comedy.results.slice(0, 12),
    },
    {
      id: "horror-movies",
      title: "Horror & Suspense",
      href: "/movies?genre=27",
      items: horror.results.slice(0, 12),
    },
    {
      id: "recent-movies",
      title: "Recently Released",
      href: "/movies?sort=release_date.desc",
      items: recent.results.slice(0, 12),
    },
  ];

  const filled = sections.filter((s) => s.items.length > 0);

  return {
    hero,
    heroItems,
    sections: filled,
    genres,
  };
}

export async function safeGetMoviesDiscoveryHome() {
  if (!isCatalogConfigured()) {
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: false,
    };
  }
  if (cachedMoviesDiscovery && Date.now() - cachedMoviesDiscovery.at < DISCOVERY_CACHE_TTL_MS) {
    return { ...cachedMoviesDiscovery.data, configured: true };
  }
  if (inFlightMovies) {
    try {
      const data = await inFlightMovies;
      return { ...data, configured: true };
    } catch {
      // Fall through to retry
    }
  }
  try {
    inFlightMovies = getMoviesDiscoveryHome();
    const data = await inFlightMovies;
    cachedMoviesDiscovery = { at: Date.now(), data };
    return { ...data, configured: true };
  } catch (error) {
    console.error("[catalog] movies discovery home failed", error);
    if (cachedMoviesDiscovery?.data) {
      return { ...cachedMoviesDiscovery.data, configured: true };
    }
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load movies",
    };
  } finally {
    inFlightMovies = null;
  }
}

/**
 * Assembles the TV discovery homepage sections mirroring the Discover page.
 */
export async function getTvDiscoveryHome(): Promise<{
  hero: MediaSummary | null;
  heroItems: MediaSummary[];
  sections: DiscoverySection[];
  genres: Genre[];
}> {
  const provider = getMediaProvider();

  const [
    trending,
    popular,
    topRated,
    scifi,
    drama,
    action,
    crime,
    comedy,
    recent,
    genres,
  ] = await Promise.all([
    settledPage(provider.getTrending("tv", "day"), "trending-tv"),
    settledPage(provider.getPopularTv(), "popular-tv"),
    settledPage(provider.getTopRatedTv(), "top-rated-tv"),
    settledPage(
      provider.discoverTv({ genreIds: ["10765"], sortBy: "popularity.desc" }),
      "scifi-tv",
    ),
    settledPage(
      provider.discoverTv({ genreIds: ["18"], sortBy: "popularity.desc" }),
      "drama-tv",
    ),
    settledPage(
      provider.discoverTv({ genreIds: ["10759"], sortBy: "popularity.desc" }),
      "action-tv",
    ),
    settledPage(
      provider.discoverTv({ genreIds: ["80"], sortBy: "popularity.desc" }),
      "crime-tv",
    ),
    settledPage(
      provider.discoverTv({ genreIds: ["35"], sortBy: "popularity.desc" }),
      "comedy-tv",
    ),
    settledPage(
      provider.discoverTv({
        sortBy: "release_date.desc",
        yearGte: new Date().getFullYear() - 1,
        voteAverageGte: 6,
      }),
      "recent-tv",
    ),
    settledGenres(provider.getTvGenres(), "tv-genres"),
  ]);

  const heroPool = [
    ...popular.results.slice(0, 5),
    ...trending.results.slice(0, 4),
    ...topRated.results.slice(0, 3),
  ];

  const seen = new Set<string>();
  const heroItems = heroPool.filter((item) => {
    const key = `tv:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 5);

  const hero = heroItems[0] ?? popular.results[0] ?? null;

  const sections: DiscoverySection[] = [
    {
      id: "trending-tv",
      title: "Trending Series",
      href: "/tv?sort=popularity.desc",
      items: trending.results.slice(0, 12),
    },
    {
      id: "popular-tv",
      title: "Popular TV Shows",
      href: "/tv?sort=popularity.desc",
      items: popular.results.slice(0, 12),
    },
    {
      id: "top-rated-tv",
      title: "Top Rated Series",
      href: "/tv?section=top_rated",
      items: topRated.results.slice(0, 12),
    },
    {
      id: "scifi-tv",
      title: "Sci-Fi & Fantasy Epics",
      href: "/tv?genre=10765",
      items: scifi.results.slice(0, 12),
    },
    {
      id: "drama-tv",
      title: "Drama Masterpieces",
      href: "/tv?genre=18",
      items: drama.results.slice(0, 12),
    },
    {
      id: "action-tv",
      title: "Action & Adventure",
      href: "/tv?genre=10759",
      items: action.results.slice(0, 12),
    },
    {
      id: "crime-tv",
      title: "Crime & Mystery",
      href: "/tv?genre=80",
      items: crime.results.slice(0, 12),
    },
    {
      id: "comedy-tv",
      title: "Comedy Series",
      href: "/tv?genre=35",
      items: comedy.results.slice(0, 12),
    },
    {
      id: "recent-tv",
      title: "Recently Aired",
      href: "/tv?sort=release_date.desc",
      items: recent.results.slice(0, 12),
    },
  ];

  const filled = sections.filter((s) => s.items.length > 0);

  return {
    hero,
    heroItems,
    sections: filled,
    genres,
  };
}

export async function safeGetTvDiscoveryHome() {
  if (!isCatalogConfigured()) {
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: false,
    };
  }
  if (cachedTvDiscovery && Date.now() - cachedTvDiscovery.at < DISCOVERY_CACHE_TTL_MS) {
    return { ...cachedTvDiscovery.data, configured: true };
  }
  if (inFlightTv) {
    try {
      const data = await inFlightTv;
      return { ...data, configured: true };
    } catch {
      // Fall through to retry
    }
  }
  try {
    inFlightTv = getTvDiscoveryHome();
    const data = await inFlightTv;
    cachedTvDiscovery = { at: Date.now(), data };
    return { ...data, configured: true };
  } catch (error) {
    console.error("[catalog] tv discovery home failed", error);
    if (cachedTvDiscovery?.data) {
      return { ...cachedTvDiscovery.data, configured: true };
    }
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load TV shows",
    };
  } finally {
    inFlightTv = null;
  }
}

