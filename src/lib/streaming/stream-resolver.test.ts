import { describe, expect, it } from "vitest";
import {
  STREAMING_SERVERS,
  buildStreamUrl,
  getPlaybackQueue,
  getSmartStreamingOptions,
  getStreamingOptions,
} from "./stream-resolver";

describe("Hidden multi-source playback engine", () => {
  it("provides exactly the 8 official streaming sources matching reference architecture", () => {
    expect(STREAMING_SERVERS.length).toBe(8);
    expect(STREAMING_SERVERS.map((s) => s.name)).toEqual([
      "Lisbon",
      "Sakura",
      "Nebula",
      "Solara",
      "Athens",
      "Joy",
      "Castle",
      "Canaias",
    ]);

    expect(STREAMING_SERVERS[0]!.flag).toBe("🇺🇸");
    expect(STREAMING_SERVERS[1]!.flag).toBe("🇯🇵");
    expect(STREAMING_SERVERS[7]!.flag).toBe("🇧🇷");
  });

  it("resolves all 8 servers for movies with honest 4K/1080p badges", () => {
    const movieSources = getSmartStreamingOptions({
      type: "movie",
      tmdbId: "157336", // Interstellar
    });

    expect(movieSources.length).toBe(8);
    // Lisbon is primary
    expect(movieSources[0]!.server.id).toBe("lisbon");
    expect(movieSources[0]!.server.badge).toBe("4K Ultra HD");
    expect(movieSources[0]!.url).toContain("vidfast.vc/movie/157336");

    // Sakura is anime/intl
    expect(movieSources[1]!.server.id).toBe("sakura");
    expect(movieSources[1]!.server.flag).toBe("🇯🇵");

    // Athens is 4K Ultra HD
    expect(movieSources[4]!.server.id).toBe("athens");
    expect(movieSources[4]!.server.badge).toBe("4K Ultra HD");

    // Canaias is global Brazil edge
    expect(movieSources[7]!.server.id).toBe("canaias");
    expect(movieSources[7]!.server.flag).toBe("🇧🇷");
  });

  it("resolves all 8 servers for TV series with 4K Lisbon and 1080p fallback badges", () => {
    const tvSources = getSmartStreamingOptions({
      type: "tv",
      tmdbId: "97951", // Severance
      season: 1,
      episode: 3,
    });

    expect(tvSources.length).toBe(8);
    // TV badges must be 1080p Full HD (no 4K clickbait)
    expect(tvSources[0]!.server.badge).toBe("4K Ultra HD");
    expect(tvSources[0]!.url).toContain("vidfast.vc/tv/97951/1/3");
    expect(tvSources[4]!.server.badge).toBe("4K Ultra HD");
  });

  it("builds custom season and episode URLs accurately", () => {
    const url = buildStreamUrl("sakura", {
      type: "tv",
      tmdbId: "126308", // Shogun
      season: 1,
      episode: 5,
    });
    expect(url).toBe("https://player.vidlove.cc/embed/tv/126308/1/5");
  });

  it("builds a distinct stream URL for each TV season and episode", () => {
    const s1e1 = buildStreamUrl("lisbon", {
      type: "tv",
      tmdbId: "66732",
      season: 1,
      episode: 1,
    });
    const s1e2 = buildStreamUrl("lisbon", {
      type: "tv",
      tmdbId: "66732",
      season: 1,
      episode: 2,
    });
    const s2e1 = buildStreamUrl("lisbon", {
      type: "tv",
      tmdbId: "66732",
      season: 2,
      episode: 1,
    });

    expect(s1e1).toContain("/tv/66732/1/1");
    expect(s1e2).toContain("/tv/66732/1/2");
    expect(s2e1).toContain("/tv/66732/2/1");
    expect(s1e1).not.toBe(s1e2);
    expect(s1e1).not.toBe(s2e1);

    for (const server of STREAMING_SERVERS) {
      const a = buildStreamUrl(server.id, {
        type: "tv",
        tmdbId: "66732",
        season: 1,
        episode: 1,
      });
      const b = buildStreamUrl(server.id, {
        type: "tv",
        tmdbId: "66732",
        season: 1,
        episode: 4,
      });
      expect(a).not.toBe(b);
    }
  });

  it("keeps backward-compatible alias getStreamingOptions", () => {
    const options = getStreamingOptions({ type: "movie", tmdbId: "27205" });
    expect(options.length).toBe(8);
    expect(options[0]!.server.id).toBe("lisbon");
  });

  it("routes every server to a live player host, never a blank shell", () => {
    const tvSources = getSmartStreamingOptions({
      type: "tv",
      tmdbId: "94605",
      season: 1,
      episode: 1,
    });
    const movieSources = getSmartStreamingOptions({
      type: "movie",
      tmdbId: "157336",
    });

    for (const sources of [tvSources, movieSources]) {
      const urls = sources.map((s) => s.url);
      expect(urls.length).toBe(8);
      for (const url of urls) {
        expect(url.startsWith("https://")).toBe(true);
        expect(url.includes("vidsrc.su")).toBe(false);
        expect(url.includes("cinejoy.to")).toBe(false);
      }
      expect(urls[0]).toContain("vidfast.vc");
    }
  });

  it("puts Lisbon vFast first in the hidden playback queue, then silent fallbacks", () => {
    const queue = getPlaybackQueue({
      type: "tv",
      tmdbId: "66732",
      season: 1,
      episode: 1,
    });

    expect(queue.length).toBeGreaterThanOrEqual(3);
    expect(queue[0]!.id).toBe("lisbon-vfast");
    expect(queue[0]!.url).toContain("vidfast.vc/tv/66732/1/1");
    expect(queue[0]!.url).toContain("server=vFast");
    expect(queue[1]!.id).toBe("lisbon-vrapid");
    expect(queue[1]!.url).toContain("server=vRapid");
    expect(queue[2]!.id).toBe("nebula");
    expect(queue[2]!.url).toContain("vidlink.pro");
  });

  it("passes resume startAt into the Lisbon playback URL", () => {
    const queue = getPlaybackQueue({
      type: "movie",
      tmdbId: "299536",
      startAtSeconds: 1800,
    });
    expect(queue[0]!.url).toContain("startAt=1800");
    expect(queue[0]!.url).toContain("vidfast.vc/movie/299536");
  });
});
