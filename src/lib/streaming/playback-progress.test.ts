import { describe, expect, it } from "vitest";
import {
  formatTimecode,
  parsePlaybackTime,
  progressKey,
  resumeSeconds,
  shouldResume,
  type PlaybackProgress,
} from "./playback-progress";

function progress(seconds: number, duration: number | null = 7200): PlaybackProgress {
  return { seconds, duration, updatedAt: 1 };
}

describe("playback progress", () => {
  it("keys movies and episodes separately", () => {
    expect(progressKey({ mediaType: "movie", tmdbId: "299536" })).toBe(
      "argus:playback:movie:299536",
    );
    expect(
      progressKey({
        mediaType: "tv",
        tmdbId: "66732",
        season: 1,
        episode: 3,
      }),
    ).toBe("argus:playback:tv:66732:s1:e3");
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
});
