import { discoverVidcoreCloud, type VidcoreBrowser, type VidcoreDiscovered } from "./vidcore-cloud";
import { CLOUDFLARE_HLS_RELAY } from "./relay";
import type { CinejoyCaption } from "./cinejoy-stream";

const ORIGIN = "https://vidcore.io";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

export interface VidcoreHit {
  url: string;
  mirror: string;
  is4K: boolean;
  captions: CinejoyCaption[];
}
export interface VidcoreRelay { fetch(input: Request): Promise<Response> }
const completed = new Map<string, { at: number; hit: VidcoreHit }>();
const pending = new Map<string, Promise<VidcoreHit | null>>();

function edgeCache(): Cache | undefined {
  return typeof caches === "undefined" ? undefined : (caches as CacheStorage & { default?: Cache }).default;
}

function secureUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password
    || url.hostname === "localhost" || url.hostname.endsWith(".trycloudflare.com")
    || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) throw new Error("Invalid VidCore upstream");
  return url.href;
}

// Prewrapped public edge URLs keep VidCore media on Cloudflare even during the
// localhost preview. Other providers retain their existing localhost relay.
export function vidcoreMediaUrl(upstream: string): string {
  return `${CLOUDFLARE_HLS_RELAY}?${new URLSearchParams({ url: secureUrl(upstream), referer: `${ORIGIN}/`, mode: "cloud" })}`;
}

async function request(url: string, init: RequestInit = {}, deadline?: AbortSignal, relay?: VidcoreRelay) {
  const timeout = AbortSignal.timeout(6000);
  const req = new Request(secureUrl(url), { ...init, signal: deadline ? AbortSignal.any([timeout, deadline]) : timeout });
  const response = relay ? await relay.fetch(req) : await fetch(req);
  if (!response.ok) throw new Error(`VidCore upstream returned ${response.status}`);
  return response;
}

async function resolve(input: { type: "movie" | "tv"; tmdbId: string; season?: number; episode?: number }, browser: VidcoreBrowser, relay?: VidcoreRelay): Promise<VidcoreHit | null> {
  const deadline = AbortSignal.timeout(24_000);
  const fetchSource = (url: string, init?: RequestInit) => request(url, init, deadline, relay);
  // Share the body, not a Response: concurrent mirrors must not consume the
  // same response stream twice. Entries live only for this source lookup.
  const manifests = new Map<string, Promise<string>>();
  const readManifest = (upstream: string): Promise<string> => {
    const url = vidcoreMediaUrl(upstream);
    const existing = manifests.get(url);
    if (existing) return existing;
    const pending = fetchSource(url, { headers: { "User-Agent": USER_AGENT } }).then(response => response.text());
    manifests.set(url, pending);
    return pending;
  };
  if (!/^\d+$/.test(input.tmdbId)) throw new Error("Invalid VidCore TMDB ID");
  const season = input.season ?? 1;
  const episode = input.episode ?? 1;
  if (!Number.isSafeInteger(season) || !Number.isSafeInteger(episode) || season < 1 || episode < 1) throw new Error("Invalid VidCore episode");
  const path = input.type === "tv" ? `/tv/${input.tmdbId}/${season}/${episode}` : `/movie/${input.tmdbId}`;
  const cache = edgeCache();
  const cacheRequest = new Request(`https://erasmus-web.erasmustv.workers.dev/__vidcore-cache/v1${path}`);
  if (cache) {
    try {
      const cached = await cache.match(cacheRequest);
      if (cached) return await cached.json() as VidcoreHit;
    } catch { /* Cache availability must not block discovery. */ }
  }
  const candidates: VidcoreDiscovered[] = await discoverVidcoreCloud(browser, path);
  const failures: string[] = [];
  // Mirror choice remains strictly inside VidCore and uses actual manifest tiers.
  const results = await Promise.all(candidates.map(async ({ mirror, source }) => {
    try {
      if (!source.url) return null;
      let upstream = secureUrl(source.url);
      // Prime sometimes returns only the UHD media playlist. Restore its ABR
      // master only when it exists; never manufacture a quality tier.
      if (mirror.toLowerCase() === "prime" && /\/vd\/.*\/index-[^/]+\.m3u8(?:\?|$)/.test(upstream)) {
        const master = new URL("master.m3u8", upstream).href;
        try {
          const text = await readManifest(master);
          if (text.startsWith("#EXTM3U") && text.includes("#EXT-X-STREAM-INF:")) upstream = master;
        } catch { /* Probe the original source below. */ }
      }
      const url = vidcoreMediaUrl(upstream);
      const text = await readManifest(upstream);
      if (!text.trimStart().startsWith("#EXTM3U")) return null;
      const dimensions = [...text.matchAll(/RESOLUTION=(\d+)x(\d+)/g)].map(m => ({ width: Number(m[1]), height: Number(m[2]) }));
      const best = dimensions.reduce((a, b) => b.width * b.height > a.width * a.height ? b : a, { width: 0, height: 0 });
      const captions: CinejoyCaption[] = (source.tracks || []).filter(t => t.kind !== "thumbnails" && (t.file || t.url)).flatMap(t => {
        try { return [{ url: vidcoreMediaUrl(t.file || t.url!), label: t.label || "Subtitle", language: t.language || (/english/i.test(t.label || "") ? "en" : "und") }]; } catch { return []; }
      });
      return { url, mirror, is4K: best.width >= 3800 || best.height >= 2160, captions, score: best.width * best.height, adaptive: dimensions.length > 1 };
    } catch (error) {
      failures.push(`${mirror}: ${error instanceof Error ? error.name + ": " + error.message : "request failed"}`);
      return null;
    }
  }));
  const usable = results.filter((hit): hit is NonNullable<typeof hit> => hit !== null);
  usable.sort((a, b) => b.score - a.score || Number(b.adaptive) - Number(a.adaptive));
  if (!usable.length && failures.length) throw new Error(`VidCore media unavailable (${failures.join("; ")})`);
  const best = usable[0] || null;
  if (cache && best) {
    try { await cache.put(cacheRequest, Response.json(best, { headers: { "Cache-Control": "public, max-age=120" } })); }
    catch { /* Playback still works when the edge cache is unavailable. */ }
  }
  return best;
}

export function resolveVidcoreDirectStream(input: { type: "movie" | "tv"; tmdbId: string; season?: number; episode?: number }, browser: VidcoreBrowser, relay?: VidcoreRelay): Promise<VidcoreHit | null> {
  const key = `${input.type}:${input.tmdbId}:${input.season ?? 1}:${input.episode ?? 1}`;
  const cached = completed.get(key);
  if (cached && Date.now() - cached.at < 120_000) return Promise.resolve(cached.hit);
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = resolve(input, browser, relay).then(hit => {
    if (hit) {
      if (completed.size >= 24) completed.delete(completed.keys().next().value!);
      completed.set(key, { at: Date.now(), hit });
    }
    return hit;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
