import { describe, expect, it, beforeEach } from "vitest";
import {
  clearPlaybackProgress,
  clearRecentPlaybackItem,
  clearTvShowResume,
  formatTimecode,
  getPlaybackProgress,
  getRecentPlayback,
  getTvShowResume,
  parsePlaybackTime,
  progressKey,
  resumeSeconds,
  savePlaybackProgress,
  saveRecentPlaybackItem,
  saveTvShowResume,
  shouldResume,
  tvLastKey,
  type PlaybackProgress,
} from "./playback-progress";

function progress(seconds: number, duration: number | null = 7200): PlaybackProgress {
  return { seconds, duration, updatedAt: 1 };
}

// Mock localStorage for node/vitest environment
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  get length() {
    return store.size;
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
};
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

describe("playback progress", () => {
  beforeEach(() => {
    store.clear();
  });

  it("keys movies and episodes separately", () => {
    expect(progressKey({ mediaType: "movie", tmdbId: "299536" })).toBe(
      "erasmus:playback:movie:299536",
    );
    expect(
      progressKey({
        mediaType: "tv",
        tmdbId: "66732",
        season: 1,
        episode: 3,
      }),
    ).toBe("erasmus:playback:tv:66732:s1:e3");
    expect(tvLastKey("66732")).toBe("erasmus:playback:tv-last:66732");
  });

  it("resumes from mid-title progress and skips intros or finished titles", () => {
    expect(shouldResume(progress(8))).toBe(false);
    expect(shouldResume(progress(1800))).toBe(true);
    expect(resumeSeconds(progress(1800))).toBe(1800);
    expect(shouldResume(progress(7000, 7200))).toBe(false);
    expect(shouldResume(null)).toBe(false);
  });

  it("formats compact timecodes", () => {
    expect(formatTimecode(75)).toBe("1:15");
    expect(formatTimecode(3723)).toBe("1:02:03");
  });

  it("reads currentTime from nested player messages", () => {
    expect(parsePlaybackTime({ currentTime: 42, duration: 100 })).toEqual({
      seconds: 42,
      duration: 100,
    });
    expect(
      parsePlaybackTime({
        type: "PLAYER_EVENT",
        data: { event: "time", position: 99.4, duration: 2400 },
      }),
    ).toEqual({ seconds: 99.4, duration: 2400 });
    expect(parsePlaybackTime({ time: 1_700_000_000 })).toBeNull();
  });

  it("saves and retrieves TV show resume state seamlessly", () => {
    savePlaybackProgress(
      { mediaType: "tv", tmdbId: "1396", season: 2, episode: 4 },
      1800,
      3000,
    );

    // Specific episode progress is saved
    const epProgress = getPlaybackProgress({
      mediaType: "tv",
      tmdbId: "1396",
      season: 2,
      episode: 4,
    });
    expect(epProgress).not.toBeNull();
    expect(epProgress?.seconds).toBe(1800);

    // Show-level last watched pointer is saved
    const tvResume = getTvShowResume("1396");
    expect(tvResume).not.toBeNull();
    expect(tvResume?.season).toBe(2);
    expect(tvResume?.episode).toBe(4);
    expect(tvResume?.seconds).toBe(1800);
  });

  it("advances to the next episode when current episode finishes", () => {
    // 95% watched of 3000 seconds = 2850s
    savePlaybackProgress(
      { mediaType: "tv", tmdbId: "1396", season: 2, episode: 4 },
      2900,
      3000,
    );

    // Current episode progress is cleared upon completion
    const epProgress = getPlaybackProgress({
      mediaType: "tv",
      tmdbId: "1396",
      season: 2,
      episode: 4,
    });
    expect(epProgress).toBeNull();

    // Show-level pointer advances to episode 5 with 0 seconds
    const tvResume = getTvShowResume("1396");
    expect(tvResume).not.toBeNull();
    expect(tvResume?.season).toBe(2);
    expect(tvResume?.episode).toBe(5);
    expect(tvResume?.seconds).toBe(0);
  });

  it("tracks recent playback for Continue Watching", () => {
    savePlaybackProgress(
      {
        mediaType: "movie",
        tmdbId: "550",
        title: "Fight Club",
        posterPath: "/fightclub.jpg",
      },
      1200,
      8000,
    );

    savePlaybackProgress(
      {
        mediaType: "tv",
        tmdbId: "1399",
        title: "Game of Thrones",
        season: 2,
        episode: 4,
        posterPath: "/got.jpg",
      },
      1800,
      3600,
    );

    const recent = getRecentPlayback();
    expect(recent.length).toBe(2);
    // Most recent is first (Game of Thrones)
    expect(recent[0]?.title).toBe("Game of Thrones");
    expect(recent[0]?.season).toBe(2);
    expect(recent[0]?.episode).toBe(4);
    expect(recent[0]?.seconds).toBe(1800);

    expect(recent[1]?.title).toBe("Fight Club");
    expect(recent[1]?.seconds).toBe(1200);

    clearRecentPlaybackItem("550", "movie");
    const updated = getRecentPlayback();
    expect(updated.length).toBe(1);
    expect(updated[0]?.title).toBe("Game of Thrones");
  });
});
