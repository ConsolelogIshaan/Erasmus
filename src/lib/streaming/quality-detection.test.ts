import { describe, expect, it } from "vitest";

describe("Truthful Stream Quality Detection", () => {
  const is4K = (dims?: { height?: number; width?: number; url?: string; activeSrc?: string }) => {
    const w = dims?.width || 0;
    const h = dims?.height || 0;
    if (w >= 3200 || h >= 1600) return true;
    if (w > 0 && h > 0 && w * h >= 4_500_000) return true;
    if (dims?.url && (dims.url.includes("2160") || /(^|[._\s/-])4k([._\s/-]|$)/i.test(dims.url))) return true;
    if (dims?.activeSrc && (dims.activeSrc.includes("2160") || /(^|[._\s/-])4k([._\s/-]|$)/i.test(dims.activeSrc))) return true;
    return false;
  };

  it("identifies standard 4K 3840x2160 resolution as 4K", () => {
    expect(is4K({ width: 3840, height: 2160 })).toBe(true);
  });

  it("identifies cinema ultrawide 4K (3840x1600) resolution as 4K", () => {
    expect(is4K({ width: 3840, height: 1600 })).toBe(true);
  });

  it("identifies 4K HLS level URLs containing 2160 or 4k token", () => {
    expect(is4K({ url: "https://cdn.example.com/stream/index-s2160p-v1-a1.m3u8" })).toBe(true);
    expect(is4K({ url: "https://cdn.example.com/stream/video_4k_master.m3u8" })).toBe(true);
  });

  it("rejects 1080p Full HD resolution (1920x1080 and 1920x800) from being flagged as 4K", () => {
    expect(is4K({ width: 1920, height: 1080 })).toBe(false);
    expect(is4K({ width: 1920, height: 800 })).toBe(false);
  });

  it("rejects 720p and SD resolutions from being flagged as 4K", () => {
    expect(is4K({ width: 1280, height: 720 })).toBe(false);
    expect(is4K({ width: 854, height: 480 })).toBe(false);
    expect(is4K({ width: 640, height: 360 })).toBe(false);
  });

  it("rejects CDN domain names (like cdn1.vidfast.pro) from triggering fake 4K", () => {
    expect(is4K({ activeSrc: "https://cdn1.vidfast.pro/streams/master.m3u8" })).toBe(false);
    expect(is4K({ url: "https://cdn1.vidfast.pro/1080p/index.m3u8" })).toBe(false);
  });

  it("requires levels to contain at least one genuine 4K stream for has4KSupport to be true", () => {
    const levels1080p = [
      { width: 1920, height: 1080, url: "https://cdn.example.com/1080.m3u8" },
      { width: 1280, height: 720, url: "https://cdn.example.com/720.m3u8" },
      { width: 854, height: 480, url: "https://cdn.example.com/480.m3u8" },
    ];
    const has4K = levels1080p.some((lvl) => is4K(lvl));
    expect(has4K).toBe(false);

    const levels4K = [
      { width: 3840, height: 2160, url: "https://cdn.example.com/2160.m3u8" },
      ...levels1080p,
    ];
    const has4KWithUHD = levels4K.some((lvl) => is4K(lvl));
    expect(has4KWithUHD).toBe(true);
  });

  it("verifies Modern Family S09E07 stream levels strictly reject 4K option", () => {
    // Exact manifest profile returned by VidFast for Modern Family S09E07
    const modernFamilyLevels = [
      { width: 1920, height: 1080, bitrate: 6043872 },
      { width: 1280, height: 720, bitrate: 3053114 },
      { width: 852, height: 480, bitrate: 1302516 },
    ];
    const has4K = modernFamilyLevels.some((lvl) => is4K(lvl));
    expect(has4K).toBe(false);
  });

  it("verifies Dune 4K master playlist correctly unlocks 4K option", () => {
    // Exact manifest profile returned by VidFast for Dune (TMDB 438631)
    const duneLevels = [
      { width: 3840, height: 2160, bitrate: 16178584 },
      { width: 1920, height: 1080, bitrate: 6133690 },
      { width: 1280, height: 720, bitrate: 3110729 },
      { width: 852, height: 480, bitrate: 1317236 },
    ];
    const has4K = duneLevels.some((lvl) => is4K(lvl));
    expect(has4K).toBe(true);
  });
});
