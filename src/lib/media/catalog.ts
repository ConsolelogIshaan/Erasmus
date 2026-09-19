/**
 * High-level catalog service.
 * Features and pages call this layer — not providers or HTTP clients directly.
 */

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

export async function getMovie(id: string): Promise<MovieDetails | null> {
  const movie = await getMediaProvider().getMovie(id);
  if (!movie) return null;
  const ratings = await enrichRatings({
    imdbId: movie.imdbId,
    title: movie.title,
    releaseDate: movie.releaseDate,
    mediaType: "movie",
    voteAverage: movie.voteAverage,
    voteCount: movie.voteCount,
  });
  return { ...movie, ratings };
}

export async function getTvShow(id: string): Promise<TvDetails | null> {
  const show = await getMediaProvider().getTvShow(id);
  if (!show) return null;
  const ratings = await enrichRatings({
    imdbId: show.imdbId,
    title: show.title,
    releaseDate: show.firstAirDate ?? show.releaseDate,
    mediaType: "tv",
    voteAverage: show.voteAverage,
    voteCount: show.voteCount,
  });
  return { ...show, ratings };
}

export async function getTvSeason(
  showId: string,
  seasonNumber: number,
): Promise<TvSeason | null> {
  return getMediaProvider().getTvSeason(showId, seasonNumber);
}

export async function getPerson(id: string): Promise<PersonDetails | null> {
  return getMediaProvider().getPerson(id);
}

export async function getCollection(id: string): Promise<CollectionDetails | null> {
  return getMediaProvider().getCollection(id);
}

export async function getMovieGenres(): Promise<Genre[]> {
  return getMediaProvider().getMovieGenres();
}

export async function getTvGenres(): Promise<Genre[]> {
  return getMediaProvider().getTvGenres();
}

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
  const heroItemsRaw = heroPool.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 10);

  // Pre-enrich hero items with official logos & taglines so they render instantly with 0 client delay
  const heroItems = await Promise.all(
    heroItemsRaw.map(async (item) => {
      try {
        if (item.mediaType === "movie") {
          const m = await provider.getMovie(item.id);
          return {
            ...item,
            logoPath: m?.logoPath ?? null,
            tagline: m?.tagline ?? null,
          };
        } else {
          const t = await provider.getTvShow(item.id);
          return {
            ...item,
            logoPath: t?.logoPath ?? null,
            tagline: t?.tagline ?? null,
          };
        }
      } catch {
        return item;
      }
    }),
  );
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
      items: trending.results.slice(0, 18),
    },
    {
      id: "popular-movies",
      title: "Popular Movies",
      href: "/movies?sort=popularity.desc",
      items: popularMovies.results.slice(0, 18),
    },
    {
      id: "popular-tv",
      title: "Popular TV Shows",
      href: "/tv?sort=popularity.desc",
      items: popularTv.results.slice(0, 18),
    },
    {
      id: "now-playing",
      title: "Now Playing",
      href: "/movies?section=now_playing",
      items: nowPlaying.results.slice(0, 18),
    },
    {
      id: "upcoming",
      title: "Upcoming Movies",
      href: "/movies?section=upcoming",
      items: upcoming.results.slice(0, 18),
    },
    {
      id: "top-movies",
      title: "Top Rated Movies",
      href: "/movies?sort=vote_average.desc",
      items: topMovies.results.slice(0, 18),
    },
    {
      id: "top-tv",
      title: "Top Rated Shows",
      href: "/tv?sort=vote_average.desc",
      items: topTv.results.slice(0, 18),
    },
    {
      id: "recent",
      title: "Recently Released",
      href: "/movies?sort=release_date.desc",
      items: recentMovies.results.slice(0, 18),
    },
    {
      id: "streaming",
      title: "New on Streaming",
      href: "/discover?section=streaming",
      // Provider-ready: until a dedicated stream feed exists, reuse popular with watch providers later
      items: popularMovies.results.slice(4, 16),
    },
    {
      id: "editors",
      title: "Editor's Picks",
      items: editorsPicks,
    },
  ];

  const filled = sections.filter((s) => s.items.length > 0);

  if (filled.length === 0) {
    throw new Error(
      "Could not load any catalog sections from TMDB. Check network/DNS access to api.themoviedb.org.",
    );
  }

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
    // Same credibility floor the browse pages use — without it this rail fills
    // with one-vote 10.0 titles rather than the genre's actual best.
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
  try {
    const data = await getDiscoveryHome();
    return { ...data, configured: true };
  } catch (error) {
    console.error("[catalog] discovery home failed", error);
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load catalog",
    };
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
  const heroItemsRaw = heroPool.filter((item) => {
    const key = `movie:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 10);

  const heroItems = await Promise.all(
    heroItemsRaw.map(async (item) => {
      try {
        const m = await provider.getMovie(item.id);
        return {
          ...item,
          logoPath: m?.logoPath ?? null,
          tagline: m?.tagline ?? null,
        };
      } catch {
        return item;
      }
    }),
  );

  const hero = heroItems[0] ?? popular.results[0] ?? null;

  const sections: DiscoverySection[] = [
    {
      id: "trending-movies",
      title: "Trending Movies",
      href: "/movies?sort=popularity.desc",
      items: trending.results.slice(0, 18),
    },
    {
      id: "now-playing",
      title: "Now Playing in Theaters",
      href: "/movies?section=now_playing",
      items: nowPlaying.results.slice(0, 18),
    },
    {
      id: "popular-movies",
      title: "Popular Movies",
      href: "/movies?sort=popularity.desc",
      items: popular.results.slice(0, 18),
    },
    {
      id: "top-rated-movies",
      title: "Top Rated Films",
      href: "/movies?section=top_rated",
      items: topRated.results.slice(0, 18),
    },
    {
      id: "upcoming-movies",
      title: "Upcoming Blockbusters",
      href: "/movies?section=upcoming",
      items: upcoming.results.slice(0, 18),
    },
    {
      id: "action-movies",
      title: "Action & Adventure",
      href: "/movies?genre=28",
      items: action.results.slice(0, 18),
    },
    {
      id: "scifi-movies",
      title: "Sci-Fi & Fantasy",
      href: "/movies?genre=878",
      items: scifi.results.slice(0, 18),
    },
    {
      id: "comedy-movies",
      title: "Comedy Hits",
      href: "/movies?genre=35",
      items: comedy.results.slice(0, 18),
    },
    {
      id: "horror-movies",
      title: "Horror & Suspense",
      href: "/movies?genre=27",
      items: horror.results.slice(0, 18),
    },
    {
      id: "recent-movies",
      title: "Recently Released",
      href: "/movies?sort=release_date.desc",
      items: recent.results.slice(0, 18),
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
  try {
    const data = await getMoviesDiscoveryHome();
    return { ...data, configured: true };
  } catch (error) {
    console.error("[catalog] movies discovery home failed", error);
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load movies",
    };
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
  const heroItemsRaw = heroPool.filter((item) => {
    const key = `tv:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 10);

  const heroItems = await Promise.all(
    heroItemsRaw.map(async (item) => {
      try {
        const t = await provider.getTvShow(item.id);
        return {
          ...item,
          logoPath: t?.logoPath ?? null,
          tagline: t?.tagline ?? null,
        };
      } catch {
        return item;
      }
    }),
  );

  const hero = heroItems[0] ?? popular.results[0] ?? null;

  const sections: DiscoverySection[] = [
    {
      id: "trending-tv",
      title: "Trending Series",
      href: "/tv?sort=popularity.desc",
      items: trending.results.slice(0, 18),
    },
    {
      id: "popular-tv",
      title: "Popular TV Shows",
      href: "/tv?sort=popularity.desc",
      items: popular.results.slice(0, 18),
    },
    {
      id: "top-rated-tv",
      title: "Top Rated Series",
      href: "/tv?section=top_rated",
      items: topRated.results.slice(0, 18),
    },
    {
      id: "scifi-tv",
      title: "Sci-Fi & Fantasy Epics",
      href: "/tv?genre=10765",
      items: scifi.results.slice(0, 18),
    },
    {
      id: "drama-tv",
      title: "Drama Masterpieces",
      href: "/tv?genre=18",
      items: drama.results.slice(0, 18),
    },
    {
      id: "action-tv",
      title: "Action & Adventure",
      href: "/tv?genre=10759",
      items: action.results.slice(0, 18),
    },
    {
      id: "crime-tv",
      title: "Crime & Mystery",
      href: "/tv?genre=80",
      items: crime.results.slice(0, 18),
    },
    {
      id: "comedy-tv",
      title: "Comedy Series",
      href: "/tv?genre=35",
      items: comedy.results.slice(0, 18),
    },
    {
      id: "recent-tv",
      title: "Recently Aired",
      href: "/tv?sort=release_date.desc",
      items: recent.results.slice(0, 18),
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
  try {
    const data = await getTvDiscoveryHome();
    return { ...data, configured: true };
  } catch (error) {
    console.error("[catalog] tv discovery home failed", error);
    return {
      hero: null as MediaSummary | null,
      heroItems: [] as MediaSummary[],
      sections: [] as DiscoverySection[],
      genres: [] as Genre[],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load TV shows",
    };
  }
}

