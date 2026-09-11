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
}

const PREFIX = "argus:playback:";
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

  if (next.duration && next.seconds / next.duration >= COMPLETE_RATIO) {
    clearPlaybackProgress(input);
    return null;
  }

  try {
    localStorage.setItem(progressKey(input), JSON.stringify(next));
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
