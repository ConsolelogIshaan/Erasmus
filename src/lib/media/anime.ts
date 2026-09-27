import { discoverMovies, discoverTv, getTvGenres, getMovieGenres } from "./catalog";
import { extractAmbientColors } from "./ambient-colors";
import { backdropUrl } from "./image";
import type {
  DiscoverySection,
  Genre,
  MediaDiscoverFilters,
  MediaSummary,
  PaginatedResult,
} from "@/types/media";
import type { HeroBannerMediaItem } from "@/features/media/components/hero-banner";

async function settledPage<T>(
  promise: Promise<PaginatedResult<T>>,
  label: string,
): Promise<PaginatedResult<T>> {
  try {
    return await promise;
  } catch (error) {
    console.warn(`[anime] ${label} failed:`, error instanceof Error ? error.message : error);
    return { page: 1, totalPages: 0, totalResults: 0, results: [] };
  }
}

/**
 * Discover anime series or anime films from TMDB.
 * Filtered by Japanese animation (genre ID 16 + original language "ja").
 * Unlocks the full catalog without artificial vote-floor restrictions.
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
    voteCountGte:
      filters.voteCountGte !== undefined
        ? filters.voteCountGte
        : filters.sortBy?.startsWith("vote_average")
          ? 20
          : 0,
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
  return all.filter((g) => String(g.id) !== "16");
}

/**
 * Assembles the Anime discovery homepage sections mirroring the Discover page.
 */
export async function getAnimeDiscoveryHome(): Promise<{
  hero: HeroBannerMediaItem | null;
  heroItems: HeroBannerMediaItem[];
  sections: DiscoverySection[];
  genres: Genre[];
}> {
  const [
    popularTv,
    popularMovies,
    topRatedTv,
    actionTv,
    fantasyTv,
    comedyTv,
    recentTv,
    genres,
  ] = await Promise.all([
    settledPage(
      discoverAnime({ sortBy: "popularity.desc", page: 1 }, "tv"),
      "popular-anime-tv",
    ),
    settledPage(
      discoverAnime({ sortBy: "popularity.desc", page: 1 }, "movie"),
      "popular-anime-movies",
    ),
    settledPage(
      discoverAnime({ sortBy: "vote_average.desc", voteCountGte: 100, page: 1 }, "tv"),
      "top-rated-anime",
    ),
    settledPage(
      discoverAnime({ genreIds: ["10759"], sortBy: "popularity.desc", page: 1 }, "tv"),
      "action-anime",
    ),
    settledPage(
      discoverAnime({ genreIds: ["10765"], sortBy: "popularity.desc", page: 1 }, "tv"),
      "fantasy-anime",
    ),
    settledPage(
      discoverAnime({ genreIds: ["35"], sortBy: "popularity.desc", page: 1 }, "tv"),
      "comedy-anime",
    ),
    settledPage(
      discoverAnime({ sortBy: "release_date.desc", page: 1 }, "tv"),
      "recent-anime",
    ),
    getAnimeGenres("tv"),
  ]);

  // Combine top TV and film anime for rotating hero banner
  const heroPool: MediaSummary[] = [
    ...popularTv.results.slice(0, 4),
    ...popularMovies.results.slice(0, 3),
    ...topRatedTv.results.slice(0, 3),
  ];

  const seen = new Set<string>();
  const uniqueHeroRaw = heroPool.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.backdropPath || item.posterPath);
  }).slice(0, 5);

  const heroItems: HeroBannerMediaItem[] = await Promise.all(
    uniqueHeroRaw.map(async (item) => {
      const imgPath = item.backdropPath ?? item.posterPath;
      const palette = await extractAmbientColors(imgPath);
      const backdrop = backdropUrl(imgPath, "w1280");

      return {
        ...item,
        logoPath: null,
        tagline: null,
        ambientPalette: palette,
        ambientBackdropUrl: backdrop,
      };
    }),
  );

  const hero = heroItems[0] ?? null;

  const sections: DiscoverySection[] = [
    {
      id: "popular-series",
      title: "Popular Anime Series",
      href: "/anime?type=tv&sort=popularity.desc",
      items: popularTv.results.slice(0, 12),
    },
    {
      id: "popular-movies",
      title: "Acclaimed Anime Films",
      href: "/anime?type=movie&sort=popularity.desc",
      items: popularMovies.results.slice(0, 12),
    },
    {
      id: "top-rated",
      title: "Top Rated Masterpieces",
      href: "/anime?sort=vote_average.desc",
      items: topRatedTv.results.slice(0, 12),
    },
    {
      id: "action-shonen",
      title: "Action & Shonen",
      href: "/anime?genre=10759",
      items: actionTv.results.slice(0, 12),
    },
    {
      id: "fantasy-isekai",
      title: "Fantasy & Isekai",
      href: "/anime?genre=10765",
      items: fantasyTv.results.slice(0, 12),
    },
    {
      id: "comedy-slice-of-life",
      title: "Comedy & Slice of Life",
      href: "/anime?genre=35",
      items: comedyTv.results.slice(0, 12),
    },
    {
      id: "recent-simulcasts",
      title: "New & Recent Simulcasts",
      href: "/anime?sort=release_date.desc",
      items: recentTv.results.slice(0, 12),
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

let cachedAnimeHome: { data: Awaited<ReturnType<typeof getAnimeDiscoveryHome>>; timestamp: number } | null = null;
let inFlightAnime: Promise<Awaited<ReturnType<typeof getAnimeDiscoveryHome>>> | null = null;
const ANIME_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export async function safeGetAnimeDiscoveryHome(): Promise<
  | (Awaited<ReturnType<typeof getAnimeDiscoveryHome>> & { configured: true; error?: never })
  | {
      hero: null;
      heroItems: never[];
      sections: never[];
      genres: never[];
      configured: true;
      error: string;
    }
> {
  const now = Date.now();
  if (cachedAnimeHome && now - cachedAnimeHome.timestamp < ANIME_CACHE_TTL) {
    return { ...cachedAnimeHome.data, configured: true };
  }
  if (inFlightAnime) {
    try {
      const data = await inFlightAnime;
      return { ...data, configured: true };
    } catch {
      // Fall through to retry
    }
  }

  try {
    inFlightAnime = getAnimeDiscoveryHome();
    const data = await inFlightAnime;
    cachedAnimeHome = { data, timestamp: Date.now() };
    return { ...data, configured: true };
  } catch (error) {
    console.error("[anime] Failed to load anime discovery home:", error);
    return {
      hero: null,
      heroItems: [],
      sections: [],
      genres: [],
      configured: true,
      error: error instanceof Error ? error.message : "Failed to load anime catalog",
    };
  } finally {
    inFlightAnime = null;
  }
}
