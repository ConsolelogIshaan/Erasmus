import { describe, expect, it } from "vitest";
import { STREAMING_SERVERS } from "./stream-resolver";
import { buildSheguQuery, sheguServerName } from "./cinejoy-stream";
import { extractDirectStream } from "./direct-stream";
import {
  assToVtt,
  cuesAtTime,
  isAssText,
  isSrtText,
  parseSubtitleCues,
  srtToVtt,
} from "./subtitles";
import { publicTracks } from "./wyzie";

describe("direct stream proxy path", () => {
  it("encodes an https playlist into the HLS relay", () => {
    const upstream = "https://cdn.example/master.m3u8";
    const proxied = `/api/stream/hls?url=${encodeURIComponent(upstream)}`;
    expect(proxied).toContain("url=https%3A");
    expect(proxied.startsWith("/api/stream/hls")).toBe(true);
  });

  it("maps every named server onto the cinejoy shegu query", () => {
    const urls = STREAMING_SERVERS.map((server) =>
      buildSheguQuery({
        title: "Interstellar",
        type: "movie",
        year: "2014",
        imdbId: "tt0816692",
        tmdbId: "157336",
        serverName: sheguServerName(server.id),
      }),
    );
    expect(urls).toHaveLength(8);
    expect(new Set(urls).size).toBe(8);
    expect(urls[0]).toContain("server=Lisbon");
    expect(urls[2]).toContain("server=Nebula");
    expect(urls[3]).toContain("server=Solara");
    expect(urls[0]).toContain("api.shegu.st");
  });

  it("converts SRT timestamps into WebVTT cues", () => {
    const srt = `1
00:00:06,000 --> 00:00:12,074
My dad was a farmer.
`;
    expect(isSrtText(srt)).toBe(true);
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:06.000 --> 00:00:12.074");
    const cues = parseSubtitleCues(srt);
    expect(cues[0]?.text).toBe("My dad was a farmer.");
    expect(cuesAtTime(cues, 8)).toBe("My dad was a farmer.");
    expect(cuesAtTime(cues, 1)).toBe("");
  });

  it("converts ASS/SSA anime subtitles into WebVTT cues with clean text", () => {
    const ass = `[Script Info]
Title: Jujutsu Kaisen
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:02.07,0:00:03.54,Main,Gojou,0000,0000,0000,,Morning.
Dialogue: 0,0:00:29.60,0:00:32.09,Main,Gojou,0000,0000,0000,,{\\pos(100,200)\\b1}I'm in charge of the \\Nfirst-years at Jujutsu Tech.
`;
    expect(isAssText(ass)).toBe(true);
    const vtt = assToVtt(ass);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:02.070 --> 00:00:03.540");
    expect(vtt).toContain("Morning.");
    expect(vtt).toContain("00:00:29.600 --> 00:00:32.090");
    expect(vtt).toContain("I'm in charge of the \nfirst-years at Jujutsu Tech.");

    const cues = parseSubtitleCues(ass);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe("Morning.");
    expect(cuesAtTime(cues, 2.5)).toBe("Morning.");
    expect(cuesAtTime(cues, 30)).toBe("I'm in charge of the \nfirst-years at Jujutsu Tech.");
    expect(cuesAtTime(cues, 50)).toBe("");
  });

  it("exposes subtitle files through the dedicated subs route", () => {
    const tracks = publicTracks({ id: "1399", season: "1", episode: "1" }, [
      { display: "English", language: "en", url: "https://vidfast.vc/wyzie/abc" },
    ]);
    expect(tracks[0]!.url).toContain("/api/stream/subs/file?");
    expect(tracks[0]!.url).toContain("id=1399");
    expect(tracks[0]!.url).toContain("index=0");
    expect(tracks[0]!.url).not.toContain("/api/stream/hls");
  });

  it("builds exact query for multi-episode series and anime beyond episode 12 without rewriting season", () => {
    const query = buildSheguQuery({
      title: "Jujutsu Kaisen",
      type: "tv",
      year: "2020",
      tmdbId: "95479",
      serverName: "Lisbon",
      season: 1,
      episode: 13,
    });
    expect(query).toContain("season=1");
    expect(query).toContain("episode=13");
    expect(query).not.toContain("season=2");
  });

  it("extracts direct stream for movie without iframes or popups", async () => {
    const res = await extractDirectStream({
      type: "movie",
      tmdbId: "1011985",
      serverId: "lisbon",
    });
    expect(res.ok).toBe(true);
    expect(res.servers.length).toBeGreaterThan(0);
    expect(res.servers[0]?.url).toContain(".m3u8");
  }, 15000);

  it("extracts direct stream for TV series without iframes or popups", async () => {
    const res = await extractDirectStream({
      type: "tv",
      tmdbId: "1399",
      season: 1,
      episode: 1,
      serverId: "nebula",
    });
    expect(res.ok).toBe(true);
    expect(res.servers.length).toBeGreaterThan(0);
    expect(res.servers[0]?.url).toContain(".m3u8");
  }, 15000);
});
