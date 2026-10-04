import { afterEach, describe, expect, it, vi } from "vitest";
import { runInNewContext } from "node:vm";
import { discoverVidcoreCloud, type VidcoreBrowser } from "./vidcore-cloud";
import { resolveVidcoreDirectStream, vidcoreMediaUrl } from "./vidcore-direct";

function browserFor(result: unknown): VidcoreBrowser {
  return {
    limits: vi.fn(async () => ({ usedBrowserTimeSeconds: 0, allowedBrowserAcquisitions: 1 })),
    quickAction: vi.fn(async () => Response.json({ result: `<pre data-json="${encodeURIComponent(JSON.stringify(result))}"></pre>` })),
  };
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("VidCore cloud discovery", () => {
  it("expires an edge hit at its original deadline after promoting it to memory", async () => {
    vi.useFakeTimers();
    const input = { type: "tv" as const, tmdbId: "900020", episode: 2 };
    const expiresAt = Date.now() + 20_000;
    const cache = { match: vi.fn(async () => Response.json({ url: vidcoreMediaUrl("https://cdn.example/old.m3u8"), mirror: "Supreme", is4K: true, captions: [], expiresAt })), put: vi.fn() };
    vi.stubGlobal("caches", { default: cache });
    const browser = browserFor({ ok: true, sources: [{ mirror: "Supreme", source: { url: "https://cdn.example/new.m3u8" } }] });
    const relay = { fetch: vi.fn(async () => new Response("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\nuhd.m3u8")) };
    const first = await resolveVidcoreDirectStream(input, browser, relay);
    expect(first?.expiresAt).toBe(expiresAt);
    expect(browser.quickAction).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_001);
    const next = await resolveVidcoreDirectStream(input, browser, relay);
    expect(new URL(next!.url).searchParams.get("url")).toContain("new.m3u8");
    expect(browser.quickAction).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("refreshes a failed cached source and bypasses the edge entry on Retry", async () => {
    const old = { url: vidcoreMediaUrl("https://cdn.example/old.m3u8"), mirror: "Supreme", is4K: true, captions: [], expiresAt: Date.now() + 120_000 };
    const cache = { match: vi.fn(async () => Response.json(old)), delete: vi.fn(async () => true), put: vi.fn() };
    vi.stubGlobal("caches", { default: cache });
    const browser = browserFor({ ok: true, sources: [{ mirror: "Supreme", source: { url: "https://cdn.example/new.m3u8" } }] });
    const relay = { fetch: vi.fn(async () => new Response("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\nuhd.m3u8")) };
    const input = { type: "movie" as const, tmdbId: "900021" };
    expect((await resolveVidcoreDirectStream(input, browser, relay))?.url).toBe(old.url);
    const refreshed = await resolveVidcoreDirectStream({ ...input, refresh: true }, browser, relay);
    expect(new URL(refreshed!.url).searchParams.get("url")).toContain("new.m3u8");
    expect(cache.delete).toHaveBeenCalledTimes(1);
    expect(cache.match).toHaveBeenCalledTimes(1);
    expect(browser.quickAction).toHaveBeenCalledTimes(1);
    expect(await resolveVidcoreDirectStream(input, browser, relay)).toBe(refreshed);
  });

  it("shares identical encrypted source decoding inside the cloud browser", async () => {
    const browser = browserFor({ ok: true, sources: [] });
    await discoverVidcoreCloud(browser, "/movie/900010");
    const options = vi.mocked(browser.quickAction).mock.calls[0][1];
    const script = (options.addScriptTag as { content: string }[])[0].content;
    const upstream = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("enc-vidcore?")) return Response.json({ status: 200, result: new URL(url).searchParams.get("stage") === "1"
        ? { stage1: "https://vidcore.io/handshake", token: "csrf" }
        : { servers: "https://vidcore.io/catalog", stream: "https://vidcore.io/stream", token: "csrf" } });
      if (url.endsWith("/handshake")) return new Response("handshake");
      if (url.endsWith("/catalog")) return new Response("catalog");
      if (url.includes("/stream/")) return new Response("same-encrypted-source");
      const payload = JSON.parse(init?.body as string);
      return Response.json({ status: 200, result: payload.text === "catalog"
        ? [{ name: "Supreme", data: "a" }, { name: "Prime", data: "b" }]
        : { url: "https://cdn.example/master.m3u8" } });
    });
    let result: { ok: boolean; sources: unknown[] } | undefined;
    await runInNewContext(script, {
      fetch: upstream, AbortSignal, URL, URLSearchParams, location: { origin: "https://vidcore.io" },
      document: {
        documentElement: { outerHTML: '{"en":"session"}' },
        createElement: () => ({ setAttribute: (_name: string, value: string) => { result = JSON.parse(decodeURIComponent(value)); } }),
        body: { appendChild: () => undefined },
      },
    });
    expect(result).toMatchObject({ ok: true, sources: [{ mirror: "Supreme" }, { mirror: "Prime" }] });
    expect(upstream.mock.calls.filter(([url, init]) => url.includes("dec-vidcore") && (init?.body as string)?.includes("same-encrypted-source"))).toHaveLength(1);
  });

  it("reuses Prime's successful master probe across mirrors without losing subtitles", async () => {
    const browser = browserFor({ ok: true, sources: [
      { mirror: "Prime", source: { url: "https://cdn.example/vd/title/index-2160.m3u8", tracks: [{ file: "https://cdn.example/en.vtt", label: "English" }] } },
      { mirror: "Supreme", source: { url: "https://cdn.example/vd/title/master.m3u8" } },
    ] });
    const relay = { fetch: vi.fn(async () => new Response("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=3840x2160\nuhd.m3u8\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080\nhd.m3u8")) };
    const hit = await resolveVidcoreDirectStream({ type: "movie", tmdbId: "900011" }, browser, relay);
    expect(relay.fetch).toHaveBeenCalledTimes(1);
    expect(hit).toMatchObject({ mirror: "Prime", is4K: true, captions: [{ language: "en" }] });
    expect(new URL(hit!.url).searchParams.get("url")).toBe("https://cdn.example/vd/title/master.m3u8");
  });

  it("keeps Prime's original playlist when its adaptive master is unavailable", async () => {
    const browser = browserFor({ ok: true, sources: [
      { mirror: "Prime", source: { url: "https://cdn.example/vd/fallback/index-2160.m3u8" } },
    ] });
    const relay = { fetch: vi.fn(async (request: Request) => new URL(request.url).searchParams.get("url")!.endsWith("master.m3u8")
      ? new Response(null, { status: 404 }) : new Response("#EXTM3U\n#EXTINF:6,\nsegment.ts")) };
    const hit = await resolveVidcoreDirectStream({ type: "movie", tmdbId: "900012" }, browser, relay);
    expect(relay.fetch).toHaveBeenCalledTimes(2);
    expect(hit?.mirror).toBe("Prime");
    expect(new URL(hit!.url).searchParams.get("url")).toContain("index-2160.m3u8");
    expect(hit?.is4K).toBe(false); // A tier-less media playlist cannot prove UHD.
  });

  it("uses Cloudflare's actual Quick Action result beyond the former arbitrary cutoff", async () => {
    const browser = browserFor({ ok: true, sources: [] });
    browser.limits = vi.fn(async () => ({ usedBrowserTimeSeconds: 554, allowedBrowserAcquisitions: 0 }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await resolveVidcoreDirectStream({ type: "movie", tmdbId: "900001" }, browser)).toBeNull();
    expect(browser.quickAction).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a real daily allowance rejection from Cloudflare", async () => {
    const browser = browserFor({});
    browser.quickAction = vi.fn(async () => Response.json({ errors: [{ message: "Browser time limit exceeded for today" }] }, { status: 429 }));
    await expect(discoverVidcoreCloud(browser, "/movie/900040")).rejects.toThrow("daily quota exhausted");
  });

  it("rejects a successful browser API response that contains a denied page", async () => {
    const browser = browserFor({});
    browser.quickAction = vi.fn(async () => Response.json({ result: "<html>Forbidden</html>" }));
    await expect(discoverVidcoreCloud(browser, "/movie/900002")).rejects.toThrow("did not return sources");
  });

  it("deduplicates discovery, chooses real UHD, and reuses successful results", async () => {
    const browser = browserFor({ ok: true, sources: [
      { mirror: "Supreme", source: { url: "https://cdn.example/uhd.m3u8", tracks: [{ file: "https://cdn.example/en.vtt", label: "English" }] } },
      { mirror: "Horizon", source: { url: "https://cdn.example/hd.m3u8" } },
    ] });
    const relay = { fetch: vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("mode")).toBe("cloud");
      expect(url.hostname).toBe("erasmus-hls-relay.erasmustv.workers.dev");
      return new Response(url.searchParams.get("url")?.includes("uhd")
        ? "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=18000000,RESOLUTION=3840x2160\nuhd.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhd.m3u8"
        : "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhd.m3u8");
    }) };
    const input = { type: "tv" as const, tmdbId: "900003", season: 2, episode: 3 };
    const [first, duplicate] = await Promise.all([resolveVidcoreDirectStream(input, browser, relay), resolveVidcoreDirectStream(input, browser, relay)]);
    expect(first).toBe(duplicate);
    expect(first).toMatchObject({ mirror: "Supreme", is4K: true });
    expect(first?.captions[0].language).toBe("en");
    expect(await resolveVidcoreDirectStream(input, browser, relay)).toBe(first);
    expect(browser.quickAction).toHaveBeenCalledTimes(1);
    expect(browser.quickAction).toHaveBeenCalledWith("content", expect.objectContaining({
      url: "https://vidcore.io/tv/900003/2/3",
      rejectResourceTypes: expect.arrayContaining(["script", "media"]),
    }));
  });

  it("never wraps a PC tunnel or loopback source as cloud media", () => {
    for (const url of ["http://localhost:8443/a.m3u8", "https://127.0.0.1/a.m3u8", "https://bridge.trycloudflare.com/a.m3u8"]) {
      expect(() => vidcoreMediaUrl(url)).toThrow("Invalid VidCore upstream");
    }
  });

  it("reports browser rate limiting without substituting another provider", async () => {
    const browser = browserFor({});
    browser.quickAction = vi.fn(async () => new Response(null, { status: 429 }));
    await expect(resolveVidcoreDirectStream({ type: "movie", tmdbId: "900004" }, browser)).rejects.toThrow("busy or quota exhausted");
  });
});
