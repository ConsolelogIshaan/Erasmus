export interface MediaDetailsResult {
  logoPath: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  enBackdropPath: string | null;
  logoBackdropPath: string | null;
  tagline: string | null;
  overview: string | null;
  title: string | null;
  imdbId: string | null;
}

const memoryCache = new Map<string, MediaDetailsResult>();
const inFlight = new Map<string, Promise<MediaDetailsResult | null>>();

/**
 * Client-side deduplicated and cached media details fetcher.
 * Guarantees that:
 * 1. Concurrent requests for the same media ID share a single in-flight fetch.
 * 2. Resolved results are cached in-memory for the entire session (0 duplicate fetches).
 * 3. Standard HTTP caching headers are respected (no cache-busting timestamp).
 */
export async function fetchClientMediaDetails(
  type: "movie" | "tv" | string,
  id: string | number
): Promise<MediaDetailsResult | null> {
  if (!type || !id) return null;
  const key = `${type}:${id}`;

  const cached = memoryCache.get(key);
  if (cached) {
    return cached;
  }

  const existingPromise = inFlight.get(key);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async (): Promise<MediaDetailsResult | null> => {
    try {
      const res = await fetch(`/api/media/details?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as MediaDetailsResult;
      if (data) {
        memoryCache.set(key, data);
      }
      return data;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
