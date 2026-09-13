export interface PlaybackProgress {
  seconds: number;
  duration: number | null;
  updatedAt: number;
}

export interface ProgressKeyInput {
  mediaType: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  title?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
}

export interface RecentPlaybackItem {
  tmdbId: string;
  mediaType: "movie" | "tv";
  title: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  season?: number;
  episode?: number;
  seconds: number;
  duration: number | null;
  updatedAt: number;
}

export interface TvShowResumeState {
  season: number;
  episode: number;
  seconds: number;
  duration: number | null;
  updatedAt: number;
}

const PREFIX = "argus:playback:";
const TV_LAST_PREFIX = "argus:playback:tv-last:";
const RECENT_KEY = "argus:playback:recent";
const MAX_RECENT_ITEMS = 24;
const MIN_RESUME_SECONDS = 15;
const COMPLETE_RATIO = 0.9;
const COMPLETE_REMAINING_SECONDS = 30;

export function progressKey(input: ProgressKeyInput): string {
  if (input.mediaType === "tv") {
    const season = Math.max(1, input.season ?? 1);
    const episode = Math.max(1, input.episode ?? 1);
    return `${PREFIX}tv:${input.tmdbId}:s${season}:e${episode}`;
  }
  return `${PREFIX}movie:${input.tmdbId}`;
}

export function tvLastKey(tmdbId: string): string {
  return `${TV_LAST_PREFIX}${tmdbId}`;
}

export function shouldResume(progress: PlaybackProgress | null | undefined): boolean {
  if (!progress || progress.seconds < MIN_RESUME_SECONDS) return false;
  if (progress.duration && progress.duration > 0) {
    if (progress.seconds / progress.duration >= COMPLETE_RATIO) return false;
    if (progress.duration - progress.seconds < COMPLETE_REMAINING_SECONDS) {
      return false;
    }
  }
  return true;
}

export function resumeSeconds(progress: PlaybackProgress | null | undefined): number {
  if (!shouldResume(progress) || !progress) return 0;
  return Math.floor(progress.seconds);
}

export function formatTimecode(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function asFiniteSeconds(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 86_400) return null;
  return n;
}

export function parsePlaybackTime(
  data: unknown,
): { seconds: number; duration: number | null } | null {
  if (data == null) return null;
  const stack: unknown[] = [data];
  const seen = new Set<unknown>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const record = current as Record<string, unknown>;
    const seconds =
      asFiniteSeconds(record.currentTime) ??
      asFiniteSeconds(record.currenttime) ??
      asFiniteSeconds(record.position) ??
      asFiniteSeconds(record.seconds) ??
      asFiniteSeconds(record.time);
    const duration =
      asFiniteSeconds(record.duration) ??
      asFiniteSeconds(record.durationSeconds) ??
      asFiniteSeconds(record.length);

    if (seconds != null && seconds >= 1) {
      return { seconds, duration };
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return null;
}

export function getPlaybackProgress(input: ProgressKeyInput): PlaybackProgress | null {
  try {
    const raw = localStorage.getItem(progressKey(input));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlaybackProgress;
    if (!parsed || typeof parsed.seconds !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTvShowResume(tmdbId: string, state: TvShowResumeState): void {
  try {
    localStorage.setItem(tvLastKey(tmdbId), JSON.stringify(state));
  } catch {
    /* ignore storage quota */
  }
}

export function getTvShowResume(tmdbId: string): TvShowResumeState | null {
  try {
    const raw = localStorage.getItem(tvLastKey(tmdbId));
    if (raw) {
      const parsed = JSON.parse(raw) as TvShowResumeState;
      if (parsed && typeof parsed.season === "number" && typeof parsed.episode === "number") {
        return parsed;
      }
    }
    // Backward-compatible fallback: scan localStorage for any argus:playback:tv:<tmdbId>:s*:e*
    const targetPrefix = `${PREFIX}tv:${tmdbId}:s`;
    let latest: TvShowResumeState | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(targetPrefix)) {
        const parts = k.slice(targetPrefix.length).split(":e");
        const sStr = parts[0];
        const eStr = parts[1];
        if (parts.length === 2 && sStr !== undefined && eStr !== undefined) {
          const s = parseInt(sStr, 10);
          const e = parseInt(eStr, 10);
          const itemRaw = localStorage.getItem(k);
          if (itemRaw) {
            const prog = JSON.parse(itemRaw) as PlaybackProgress;
            if (prog && (!latest || prog.updatedAt > latest.updatedAt)) {
              latest = {
                season: s,
                episode: e,
                seconds: prog.seconds,
                duration: prog.duration,
                updatedAt: prog.updatedAt,
              };
            }
          }
        }
      }
    }
    return latest;
  } catch {
    return null;
  }
}


export function getRecentPlayback(): RecentPlaybackItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      const normalized: RecentPlaybackItem[] = [];
      for (const item of list) {
        if (!item) continue;
        const rawId = item.tmdbId || item.mediaId || item.id;
        const tmdbId = String(rawId || "").trim();
        if (!tmdbId || tmdbId === "undefined" || tmdbId === "null") continue;
        normalized.push({
          tmdbId,
          mediaType: (item.mediaType || "tv") as "movie" | "tv",
          title: item.title || "",
          posterPath: item.posterPath || item.poster_path || null,
          backdropPath: item.backdropPath || item.backdrop_path || null,
          season: item.season ?? item.seasonNumber ?? 1,
          episode: item.episode ?? item.episodeNumber ?? 1,
          seconds: item.seconds ?? item.currentTime ?? 0,
          duration: item.duration ?? null,
          updatedAt: item.updatedAt || Date.now(),
        });
      }
      return normalized.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return [];
  } catch {
    return [];
  }
}

export function saveRecentPlaybackItem(item: RecentPlaybackItem): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = getRecentPlayback();
    const filtered = current.filter(
      (x) => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType)
    );
    filtered.unshift(item);
    if (filtered.length > MAX_RECENT_ITEMS) {
      filtered.length = MAX_RECENT_ITEMS;
    }
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

export function clearRecentPlaybackItem(tmdbId: string, mediaType: "movie" | "tv"): void {
  if (typeof localStorage === "undefined") return;
  try {
    const current = getRecentPlayback();
    const filtered = current.filter(
      (x) => !(x.tmdbId === tmdbId && x.mediaType === mediaType)
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

export function clearTvShowResume(tmdbId: string): void {
  try {
    localStorage.removeItem(tvLastKey(tmdbId));
  } catch {
    /* ignore */
  }
}

export function savePlaybackProgress(
  input: ProgressKeyInput,
  seconds: number,
  duration: number | null,
): PlaybackProgress | null {
  const next: PlaybackProgress = {
    seconds: Math.max(0, Math.floor(seconds)),
    duration: duration != null && duration > 0 ? Math.floor(duration) : null,
    updatedAt: Date.now(),
  };

  const isCompleted = Boolean(
    next.duration &&
      (next.seconds / next.duration >= COMPLETE_RATIO ||
        next.duration - next.seconds < COMPLETE_REMAINING_SECONDS),
  );

  if (isCompleted) {
    clearPlaybackProgress(input);
    if (input.mediaType === "tv" && input.tmdbId) {
      const season = Math.max(1, input.season ?? 1);
      const episode = Math.max(1, input.episode ?? 1);
      const now = Date.now();
      // Advance show pointer to the next episode
      saveTvShowResume(input.tmdbId, {
        season,
        episode: episode + 1,
        seconds: 0,
        duration: null,
        updatedAt: now,
      });
      if (input.title) {
        saveRecentPlaybackItem({
          tmdbId: input.tmdbId,
          mediaType: "tv",
          title: input.title,
          posterPath: input.posterPath,
          backdropPath: input.backdropPath,
          season,
          episode: episode + 1,
          seconds: 0,
          duration: null,
          updatedAt: now,
        });
      }
    } else if (input.mediaType === "movie" && input.tmdbId) {
      clearRecentPlaybackItem(input.tmdbId, "movie");
    }
    return null;
  }

  try {
    localStorage.setItem(progressKey(input), JSON.stringify(next));
    if (input.mediaType === "tv" && input.tmdbId) {
      const season = Math.max(1, input.season ?? 1);
      const episode = Math.max(1, input.episode ?? 1);
      saveTvShowResume(input.tmdbId, {
        season,
        episode,
        seconds: next.seconds,
        duration: next.duration,
        updatedAt: next.updatedAt,
      });
      if (input.title) {
        saveRecentPlaybackItem({
          tmdbId: input.tmdbId,
          mediaType: "tv",
          title: input.title,
          posterPath: input.posterPath,
          backdropPath: input.backdropPath,
          season,
          episode,
          seconds: next.seconds,
          duration: next.duration,
          updatedAt: next.updatedAt,
        });
      }
    } else if (input.mediaType === "movie" && input.tmdbId && input.title) {
      saveRecentPlaybackItem({
        tmdbId: input.tmdbId,
        mediaType: "movie",
        title: input.title,
        posterPath: input.posterPath,
        backdropPath: input.backdropPath,
        seconds: next.seconds,
        duration: next.duration,
        updatedAt: next.updatedAt,
      });
    }
  } catch {
    return next;
  }
  return next;
}

export function clearPlaybackProgress(input: ProgressKeyInput): void {
  try {
    localStorage.removeItem(progressKey(input));
  } catch {
    /* ignore quota / private mode */
  }
}
