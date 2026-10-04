import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@opennextjs/cloudflare");
  vi.doUnmock("./vidcore-direct");
  vi.doUnmock("@/lib/streaming/direct-stream");
  vi.useRealTimers();
  vi.resetModules();
});

it("the dispatch cache honors VidCore's source expiry and explicit Retry", async () => {
  vi.useFakeTimers();
  const resolver = vi.fn(async (..._args: unknown[]) => ({ url: "https://cdn.example/master.m3u8", mirror: "Supreme", is4K: true, captions: [], expiresAt: Date.now() + 120_000 }));
  vi.doMock("./vidcore-direct", () => ({ resolveVidcoreDirectStream: resolver }));
  vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { VIDCORE_BROWSER: {} } }) }));
  const { extractDirectStream } = await import("./direct-stream");
  const input = { type: "movie" as const, tmdbId: "900030", serverId: "vidcore" };
  const first = await extractDirectStream(input);
  vi.advanceTimersByTime(75_000);
  expect(await extractDirectStream(input)).toBe(first);
  expect(resolver).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(45_001);
  const next = await extractDirectStream(input);
  expect(next.expiresAt).toBeGreaterThan(first.expiresAt!);
  expect(resolver).toHaveBeenCalledTimes(2);
  await extractDirectStream({ ...input, refresh: true });
  expect(resolver).toHaveBeenCalledTimes(3);
  expect(resolver.mock.calls[2][0]).toMatchObject({ serverId: "vidcore", refresh: true });
});

it("the API forwards refresh only for the selected VidCore server", async () => {
  const extractor = vi.fn(async (..._args: unknown[]) => ({ ok: false, servers: [] }));
  vi.doMock("@/lib/streaming/direct-stream", () => ({ extractDirectStream: extractor }));
  const { GET } = await import("@/app/api/stream/direct/route");
  await GET(new Request("https://erasmus.test/api/stream/direct?id=550&server=vidcore&refresh=1"));
  await GET(new Request("https://erasmus.test/api/stream/direct?id=550&server=aphelion&refresh=1"));
  expect(extractor.mock.calls[0][0]).toMatchObject({ serverId: "vidcore", refresh: true });
  expect(extractor.mock.calls[1][0]).toMatchObject({ serverId: "aphelion", refresh: false });
});
