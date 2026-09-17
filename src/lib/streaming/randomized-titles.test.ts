import { describe, expect, it } from "vitest";
import { getSmartStreamingOptions } from "./stream-resolver";

describe("Randomized titles audit across all 8 streaming sources", () => {
  const randomMovies = [
    { title: "Inception", tmdbId: "27205" },
    { title: "Interstellar", tmdbId: "157336" },
    { title: "Spider-Man: Into the Spider-Verse", tmdbId: "324857" },
  ];

  const randomSeries = [
    { title: "Severance", tmdbId: "97951", season: 1, episode: 1 },
    { title: "Shogun", tmdbId: "126308", season: 1, episode: 1 },
    { title: "The Bear", tmdbId: "108978", season: 1, episode: 1 },
  ];

  randomMovies.forEach(({ title, tmdbId }) => {
    it(`provides all 8 streaming sources for movie: ${title}`, () => {
      const options = getSmartStreamingOptions({ type: "movie", tmdbId });
      expect(options.length).toBe(8);
      // Primary Lisbon has 4K Ultra HD badge
      expect(options[0]!.server.id).toBe("lisbon");
      expect(options[0]!.server.badge).toBe("4K Ultra HD");
      expect(options[0]!.server.flag).toBe("🇺🇸");
      expect(options[0]!.url).toContain(`vidfast.vc/movie/${tmdbId}`);
      // All 8 servers have valid URLs
      options.forEach((opt) => {
        expect(opt.url).toBeTruthy();
        expect(opt.url.startsWith("https://")).toBe(true);
      });
    });
  });

  randomSeries.forEach(({ title, tmdbId, season, episode }) => {
    it(`provides all 8 streaming sources for series: ${title}`, () => {
      const options = getSmartStreamingOptions({
        type: "tv",
        tmdbId,
        season,
        episode,
      });
      expect(options.length).toBe(8);
      // Primary Lisbon has 1080p Full HD badge
      expect(options[0]!.server.id).toBe("lisbon");
      expect(options[0]!.server.badge).toBe("4K Ultra HD");
      expect(options[0]!.url).toContain(`vidfast.vc/tv/${tmdbId}/${season}/${episode}`);
      // Sakura (anime/intl) server is ready
      expect(options[1]!.server.id).toBe("sakura");
      expect(options[1]!.server.flag).toBe("🇯🇵");
    });
  });
});
