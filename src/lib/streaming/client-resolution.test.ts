import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });

function query(server = "lisbon", episode = "1") {
  return new URLSearchParams({ type: "tv", id: "273240", season: "1", episode, server });
}

describe("playback preparation", () => {
  it("prepares the master, HD playlist and one startup fragment", async () => {
    const { prepareClientStream } = await import("./client-resolution");
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ok: true, servers: [{ url: "https://example.test/master.m3u8", is4K: true }] }))
      .mockResolvedValueOnce(new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\nhttps://example.test/720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=20000000,RESOLUTION=3840x2160\nhttps://example.test/4k.m3u8"))
      .mockResolvedValueOnce(new Response("#EXTM3U\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST"))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetcher);
    prepareClientStream({ type: "movie", id: "411", title: "Narnia", server: "lisbon" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(fetcher.mock.calls[2]?.[0]).toBe("https://example.test/720.m3u8");
    expect(fetcher.mock.calls[3]?.[0]).toBe("https://example.test/segment.ts");
  });

  it("does not prepare media for direct files or hidden pages", async () => {
    const { prepareClientStream } = await import("./client-resolution");
    vi.stubGlobal("document", { visibilityState: "visible" });
    const fetcher = vi.fn(async () => Response.json({ ok: true, servers: [{ url: "https://example.test/video.mp4", kind: "file" }] }));
    vi.stubGlobal("fetch", fetcher);
    const input = { type: "movie" as const, id: "411", title: "Narnia", server: "lisbon" };
    prepareClientStream(input);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    vi.stubGlobal("document", { visibilityState: "hidden" });
    prepareClientStream({ ...input, id: "412" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("joins an unfinished preparation when Play is clicked", async () => {
    const { resolveClientStream } = await import("./client-resolution");
    let complete!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal("fetch", fetcher);
    const prepared = resolveClientStream(query());
    const clicked = resolveClientStream(query());
    expect(clicked).toBe(prepared);
    complete(Response.json({ ok: true, servers: [{ url: "https://example.test/master.m3u8", is4K: true }] }));
    await clicked;
    await resolveClientStream(query());
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps selected servers and episodes isolated", async () => {
    const { resolveClientStream } = await import("./client-resolution");
    const fetcher = vi.fn(async () => Response.json({ ok: true, servers: [{ url: "https://example.test/master.m3u8", is4K: true }] }));
    vi.stubGlobal("fetch", fetcher);
    await resolveClientStream(query());
    await resolveClientStream(query("aphelion"));
    await resolveClientStream(query("lisbon", "2"));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not cache missing streams or failed HTTP responses", async () => {
    const { resolveClientStream } = await import("./client-resolution");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: false, servers: [] }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true, servers: [{ url: "https://example.test/stream.mp4" }] }));
    vi.stubGlobal("fetch", fetcher);
    await resolveClientStream(query());
    await expect(resolveClientStream(query())).rejects.toThrow("503");
    expect((await resolveClientStream(query())).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("refreshes degraded Lisbon results promptly and honors Retry", async () => {
    vi.useFakeTimers();
    const { resolveClientStream } = await import("./client-resolution");
    const fetcher = vi.fn(async () => Response.json({ ok: true, servers: [{ url: "https://example.test/stream.mp4", is4K: false }] }));
    vi.stubGlobal("fetch", fetcher);
    await resolveClientStream(query());
    vi.advanceTimersByTime(10_001);
    await resolveClientStream(query());
    await resolveClientStream(query(), true);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("limits speculative work without blocking real Play requests", async () => {
    const { prepareClientStream, resolveClientStream } = await import("./client-resolution");
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("document", { visibilityState: "visible" });
    const input = { type: "tv" as const, id: "273240", title: "Off Campus", server: "lisbon" };
    prepareClientStream({ ...input, episode: 1 });
    prepareClientStream({ ...input, episode: 2 });
    prepareClientStream({ ...input, episode: 3 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    void resolveClientStream(query("lisbon", "3"));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
