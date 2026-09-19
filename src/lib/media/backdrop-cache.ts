/**
 * Synchronous client-side cache for media studio-titled backdrops and posters.
 *
 * Ensures Continue Watching and landscape poster cards render their authentic
 * studio-titled backdrops instantaneously on frame zero without a 2-3 second delay.
 *
 * CRITICAL RULE:
 * ONLY verified logo backdrops (from TMDB enBackdropPath or logoBackdropPath)
 * are stored here. We NEVER store raw unverified textless backdrops.
 */

const STORAGE_KEY = "erasmus:media:verified_logos_v3";
const LEGACY_KEYS = [
  "erasmus:media:backdrop_cache",
  "erasmus:media:verified_logos",
  "erasmus:media:verified_logos_v2",
];

interface VerifiedLogoEntry {
  backdropPath: string;
  posterPath?: string | null;
  title?: string | null;
  updatedAt: number;
}

const memoryCache = new Map<string, VerifiedLogoEntry>();
let storageLoaded = false;

function buildKey(mediaType: string, id: string | number): string {
  return `${mediaType}:${String(id).trim()}`;
}

function loadStorage(): void {
  if (storageLoaded || typeof window === "undefined") return;
  storageLoaded = true;

  try {
    // Purge legacy caches to eliminate poisoned textless entries
    for (const legKey of LEGACY_KEYS) {
      if (localStorage.getItem(legKey)) {
        localStorage.removeItem(legKey);
      }
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, VerifiedLogoEntry>;
      if (parsed && typeof parsed === "object") {
        for (const [k, val] of Object.entries(parsed)) {
          if (val && typeof val.backdropPath === "string" && val.backdropPath.startsWith("/")) {
            memoryCache.set(k, val);
          }
        }
      }
    }
  } catch {
    // ignore quota/parsing errors in private mode
  }
}

/**
 * Synchronously get the verified studio-titled backdrop path for a media item.
 * Runs in ~0ms on the first render frame. Returns null if not yet verified.
 */
export function getVerifiedLogoBackdrop(
  mediaType: string,
  id: string | number | null | undefined,
): string | null {
  if (!id) return null;
  loadStorage();
  const key = buildKey(mediaType, id);
  return memoryCache.get(key)?.backdropPath ?? null;
}

/**
 * Synchronously get full verified cached metadata (backdrop, poster, title).
 */
export function getVerifiedMediaItem(
  mediaType: string,
  id: string | number | null | undefined,
): VerifiedLogoEntry | null {
  if (!id) return null;
  loadStorage();
  const key = buildKey(mediaType, id);
  return memoryCache.get(key) ?? null;
}

/**
 * Cache verified studio-titled backdrop and poster paths both in memory and localStorage.
 */
export function setVerifiedLogoBackdrop(
  mediaType: string,
  id: string | number,
  data: {
    backdropPath: string;
    posterPath?: string | null;
    title?: string | null;
  },
): void {
  if (!id || !data.backdropPath) return;
  loadStorage();
  const key = buildKey(mediaType, id);
  const existing = memoryCache.get(key);
  const next: VerifiedLogoEntry = {
    backdropPath: data.backdropPath,
    posterPath: data.posterPath !== undefined ? data.posterPath : existing?.posterPath,
    title: data.title !== undefined ? data.title : existing?.title,
    updatedAt: Date.now(),
  };

  memoryCache.set(key, next);

  if (typeof window === "undefined") return;

  try {
    const rawCache = localStorage.getItem(STORAGE_KEY);
    const parsed = rawCache ? (JSON.parse(rawCache) as Record<string, VerifiedLogoEntry>) : {};
    parsed[key] = next;

    // Cap cache at 250 items to prevent unbounded storage growth
    const entries = Object.entries(parsed);
    if (entries.length > 250) {
      entries.sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0));
      const trimmed = Object.fromEntries(entries.slice(0, 180));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // ignore quota errors
  }
}

/**
 * Aliases for backwards compatibility.
 */
export const getCachedBackdrop = getVerifiedLogoBackdrop;
export const getCachedMediaItem = getVerifiedMediaItem;
export function setCachedBackdrop(
  mediaType: string,
  id: string | number,
  data: {
    backdropPath?: string | null;
    posterPath?: string | null;
    title?: string | null;
  },
): void {
  if (data.backdropPath) {
    setVerifiedLogoBackdrop(mediaType, id, {
      backdropPath: data.backdropPath,
      posterPath: data.posterPath,
      title: data.title,
    });
  }
}
