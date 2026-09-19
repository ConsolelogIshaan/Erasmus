/**
 * Dedicated stream resolver for Bingr-backed streaming clusters:
 * - s40 (Aphelion / DarkMatter / Gaiaflix)
 * - s70 (Polaris / Hakunaymatata)
 * - s62 (Bastion / Bxcnm)
 * - s63 (Hallyu / KissKH)
 * - s30 (Nova / VidRock)
 * - s31 (Orion / CelestialDreamer)
 * - s3 (Edmunds / RemoteConsulting)
 * - AnimeSalt (Mikazuki / HiAnime cluster)
 * - Ryuu (Animex AniList Sub & Dub cluster)
 * - IMDb direct video support
 */

export interface BingrSource {
  url: string;
  quality?: string;
  type?: string;
  label?: string;
  name?: string;
  language?: string;
  isMP4?: boolean;
  headers?: Record<string, string>;
}

export interface BingrSubtitle {
  url: string;
  lang?: string;
  label?: string;
  source?: string;
}

export interface BingrStreamResponse {
  scraperName?: string;
  sources?: BingrSource[];
  subtitles?: BingrSubtitle[];
  error?: string;
  _debug?: string;
}

export interface ResolvedBingrHit {
  serverName: string;
  serverId: string;
  url: string;
  kind: "hls" | "file";
  is4K: boolean;
  quality?: string;
  referer?: string;
  headers?: Record<string, string>;
  captions: Array<{ label: string; language: string; url: string }>;
  isDirectCors: boolean;
}

const SERVER_MAP: Record<string, { srv: string; name: string; priority: number }> = {
  aphelion: { srv: "s40", name: "Aphelion", priority: 1 },
  bastion: { srv: "s62", name: "Bastion", priority: 2 },
  orion: { srv: "s31", name: "Orion", priority: 3 },
  nova: { srv: "s30", name: "Nova", priority: 4 },
  edmunds: { srv: "s3", name: "Edmunds", priority: 5 },
  hallyu: { srv: "s63", name: "Hallyu", priority: 6 },
  polaris: { srv: "s70", name: "Polaris", priority: 7 },
  animesalt: { srv: "animesalt", name: "AnimeSalt", priority: 8 },
  ryuu: { srv: "ryuu", name: "Ryuu", priority: 9 },
};

export const BINGR_SERVERS = Object.keys(SERVER_MAP);

const BINGR_API_BASE = "https://api.bingr.one/api";
const HIANIME_BASE = "https://hianime.filmu.in";
const WORMHOLE_BASE = "https://wormhole.vumeto.xyz";
const WORMHOLE_KEY = "a3f9c1d8e7b2c4d6f1a9b0c3d4e5f6789a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d";

export function unwrapDirectStreamUrl(rawUrl: string): string {
  try {
    if (rawUrl.includes("manifest?url=")) {
      const parsed = new URL(rawUrl);
      const inner = parsed.searchParams.get("url");
      if (inner && inner.startsWith("http")) {
        return inner;
      }
    }
  } catch {}
  return rawUrl;
}

export function checkIsDirectCors(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Hosts verified to emit Access-Control-Allow-Origin: *
    return (
      host.includes("rousav.tech") ||
      host.includes("gaiaflix.live") ||
      host.includes("keenanchor.top") ||
      host.includes("acdn28.com") ||
      host.includes("acdn29.com") ||
      host.includes("bxcnm.com") ||
      host.includes("bxcnv.com") ||
      host.includes("bxncw.com") ||
      host.includes("wnowe.com") ||
      host.includes("bhcxy.com") ||
      host.includes("klcxm.com") ||
      host.includes("as-cdn26.top") ||
      host.includes("as-cdn28.top") ||
      host.includes("animeapps.top") ||
      host.includes("hoxcv.com") ||
      host.includes("ngcorp.dad") ||
      host.includes("filmu.in") ||
      host.includes("animex.one") ||
      host.includes("vumeto.xyz") ||
      host.includes("workers.dev") ||
      host.includes("shadowmoonwanderer.lol") ||
      host.includes("vidrock.ru") ||
      host.includes("fodcyy.com") ||
      host.includes("imdb-video.media-imdb.com")
    );
  } catch {
    return false;
  }
}

/**
 * Cache for AniList ID resolution by title
 */
const anilistIdCache = new Map<string, number>();

/**
 * Resolves an AniList Media ID from a title using the public AniList GraphQL API.
 */
export async function resolveAniListId(title: string): Promise<number | null> {
  const cleanTitle = title.trim().toLowerCase();
  if (anilistIdCache.has(cleanTitle)) {
    return anilistIdCache.get(cleanTitle) ?? null;
  }

  const query = `
    query ($search: String) {
      Media (search: $search, type: ANIME) {
        id
        idMal
        title { romaji english native }
      }
    }
  `;

  try {
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: JSON.stringify({ query, variables: { search: title } }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { Media?: { id?: number } } };
    const id = json?.data?.Media?.id;
    if (typeof id === "number") {
      anilistIdCache.set(cleanTitle, id);
      return id;
    }
  } catch {
    // ignore lookup error
  }
  return null;
}

/** Token cache for AnimeSalt API */
let animeSaltToken: string | null = null;
let animeSaltTokenExpiry = 0;

async function getAnimeSaltToken(): Promise<string> {
  if (animeSaltToken && Date.now() < animeSaltTokenExpiry) {
    return animeSaltToken;
  }
  try {
    const res = await fetch(`${HIANIME_BASE}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        animeSaltToken = data.token;
        animeSaltTokenExpiry = Date.now() + 2 * 60 * 60 * 1000;
        return data.token;
      }
    }
  } catch {
    // fallback
  }
  return "";
}

/**
 * Resolves Anime streams directly via AnimeSalt / HiAnime cluster.
 */
export async function resolveAnimeSaltStream(params: {
  title: string;
  episode?: number;
  season?: number;
}): Promise<ResolvedBingrHit | null> {
  const { title, episode = 1, season = 1 } = params;
  try {
    const token = await getAnimeSaltToken();
    const headers: Record<string, string> = token ? { "x-api-key": token } : {};
    const url = `${HIANIME_BASE}/animesalt/streams?title=${encodeURIComponent(title)}&ep=${episode}&season=${season}`;
    const res = await fetch(url, {
      headers: {
        ...headers,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      streams?: Array<{
        server?: string;
        url: string;
        type?: string;
        quality?: number | string;
        dubType?: string;
        subtitles?: Array<{ label?: string; lang?: string; url?: string }>;
        proxyUrl?: string;
      }>;
    };

    if (data?.streams && data.streams.length > 0) {
      const stream = data.streams[0];
      if (!stream?.url) return null;

      const directUrl = stream.url;
      const isDirect = checkIsDirectCors(directUrl);
      const captions: Array<{ label: string; language: string; url: string }> = [];

      if (stream.subtitles) {
        for (const sub of stream.subtitles) {
          if (sub.url) {
            captions.push({
              label: sub.label || sub.lang || "Sub",
              language: sub.lang || "en",
              url: sub.url,
            });
          }
        }
      }

      const proxyWithKey = stream.proxyUrl
        ? (stream.proxyUrl.includes("?")
            ? `${stream.proxyUrl}&apiKey=${token}`
            : `${stream.proxyUrl}?apiKey=${token}`)
        : directUrl;

      return {
        serverName: `AnimeSalt | ${stream.dubType || "MULTI"}`,
        serverId: "animesalt",
        url: isDirect ? directUrl : proxyWithKey,
        kind: stream.type === "video" || directUrl.includes(".mp4") ? "file" : "hls",
        is4K: false,
        quality: `${stream.quality || 1080}p`,
        referer: "https://animesalt.cx/",
        captions,
        isDirectCors: isDirect,
      };
    }
  } catch {
    // fallback
  }
  return null;
}

/**
 * Resolves Anime streams via Animex GraphQL + sources cluster (Ryuu).
 */
export async function resolveAnimexStream(params: {
  anilistId: number;
  episode?: number;
  dub?: boolean;
}): Promise<ResolvedBingrHit | null> {
  const { anilistId, episode = 1, dub = false } = params;

  try {
    // 1. Resolve internal Animex ID from AniList ID
    const gqlQuery = `query Anime($anilistId: Int) { anime(anilistId: $anilistId) { id } }`;
    const gqlUrl = `https://graphql.animex.one/graphql?query=${encodeURIComponent(gqlQuery)}&variables=${encodeURIComponent(JSON.stringify({ anilistId }))}`;
    const wormholeHeaders = JSON.stringify({ "x-api-key": WORMHOLE_KEY, Accept: "application/json" });
    const wormholeUrl = `${WORMHOLE_BASE}/?url=${encodeURIComponent(gqlUrl)}&headers=${encodeURIComponent(wormholeHeaders)}`;

    const idRes = await fetch(wormholeUrl, { signal: AbortSignal.timeout(8000) });
    if (!idRes.ok) return null;
    const idData = (await idRes.json()) as { data?: { anime?: { id?: string } } };
    const animeId = idData?.data?.anime?.id;
    if (!animeId) return null;

    // 2. Fetch server providers
    const serversUrl = `https://pp.animex.one/rest/api/servers?id=${encodeURIComponent(animeId)}&epNum=${episode}`;
    const wormholeServersUrl = `${WORMHOLE_BASE}/?url=${encodeURIComponent(serversUrl)}&headers=${encodeURIComponent(wormholeHeaders)}`;
    const srvRes = await fetch(wormholeServersUrl, { signal: AbortSignal.timeout(8000) });
    if (!srvRes.ok) return null;
    const srvData = (await srvRes.json()) as {
      subProviders?: Array<{ id: string; default?: boolean }>;
      dubProviders?: Array<{ id: string; default?: boolean }>;
    };

    const providers = dub ? srvData.dubProviders : srvData.subProviders;
    if (!providers || providers.length === 0) return null;

    // 3. Try each provider for sources
    for (const provider of providers) {
      const srcUrl = `https://pp.animex.one/rest/api/sources?id=${encodeURIComponent(animeId)}&epNum=${episode}&type=${dub ? "dub" : "sub"}&providerId=${provider.id}`;
      const wormholeSrcUrl = `${WORMHOLE_BASE}/?url=${encodeURIComponent(srcUrl)}&headers=${encodeURIComponent(wormholeHeaders)}`;
      const srcRes = await fetch(wormholeSrcUrl, { signal: AbortSignal.timeout(8000) });
      if (!srcRes.ok) continue;

      const srcData = (await srcRes.json()) as {
        sources?: Array<{ url: string; quality?: string; type?: string }>;
        headers?: Record<string, string>;
        tracks?: Array<{ file?: string; url?: string; kind?: string; label?: string; lang?: string }>;
      };

      if (srcData?.sources && srcData.sources.length > 0) {
        const source = srcData.sources[0];
        if (!source?.url) continue;

        const isDirect = checkIsDirectCors(source.url);
        const captions: Array<{ label: string; language: string; url: string }> = [];

        if (srcData.tracks) {
          for (const track of srcData.tracks) {
            const trackUrl = track.file || track.url;
            if (trackUrl) {
              captions.push({
                label: track.label || track.lang || "Subtitles",
                language: track.lang || "en",
                url: trackUrl,
              });
            }
          }
        }

        return {
          serverName: `Ryuu | ${provider.id.toUpperCase()}`,
          serverId: "ryuu",
          url: source.url,
          kind: source.url.includes(".mp4") ? "file" : "hls",
          is4K: false,
          quality: source.quality || "HD",
          referer: srcData.headers?.Referer || "https://pp.animex.one/",
          headers: srcData.headers,
          captions,
          isDirectCors: isDirect,
        };
      }
    }
  } catch {
    // fallback
  }
  return null;
}

let bingrCooldownUntil = 0;

/**
 * Resolves a stream from Bingr's backend using the specified server or cascading through options.
 */
export async function resolveBingrStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverId?: string;
  title?: string;
  year?: string;
  imdbId?: string;
  anilistId?: number;
}): Promise<ResolvedBingrHit | null> {
  if (Date.now() < bingrCooldownUntil) {
    return null;
  }

  const { type, tmdbId, season = 1, episode = 1, title, year, imdbId } = input;
  const targetServerId = input.serverId?.toLowerCase() ?? "aphelion";

  // If specific Anime server selected:
  if (targetServerId === "animesalt" && title) {
    const saltHit = await resolveAnimeSaltStream({ title, episode, season });
    if (saltHit) return saltHit;
  }

  if (targetServerId === "ryuu") {
    let anilistId = input.anilistId;
    if (!anilistId && title) {
      anilistId = (await resolveAniListId(title)) ?? undefined;
    }
    if (anilistId) {
      const ryuuHit = await resolveAnimexStream({ anilistId, episode });
      if (ryuuHit) return ryuuHit;
    }
  }

  // Build candidate servers list starting with target, followed by fast healthy fallbacks
  const candidateKeys: string[] = [];
  if (SERVER_MAP[targetServerId]) {
    candidateKeys.push(targetServerId);
  }
  const healthyFallbacks = ["aphelion", "bastion", "polaris"];
  for (const key of healthyFallbacks) {
    if (!candidateKeys.includes(key)) {
      candidateKeys.push(key);
    }
  }
  // Limit cascade to at most 2 servers to keep latency strictly under 3s
  const activeCandidates = candidateKeys.slice(0, 2);

  for (const srvKey of activeCandidates) {
    // Handle anime clusters in cascade
    if (srvKey === "animesalt") {
      if (title) {
        const saltHit = await resolveAnimeSaltStream({ title, episode, season });
        if (saltHit) return saltHit;
      }
      continue;
    }
    if (srvKey === "ryuu") {
      let anilistId = input.anilistId;
      if (!anilistId && title) {
        anilistId = (await resolveAniListId(title)) ?? undefined;
      }
      if (anilistId) {
        const ryuuHit = await resolveAnimexStream({ anilistId, episode });
        if (ryuuHit) return ryuuHit;
      }
      continue;
    }

    const srvConfig = SERVER_MAP[srvKey];
    if (!srvConfig) continue;

    try {
      let data: BingrStreamResponse | null = null;

      // Special route for Aphelion TV shows
      if (srvConfig.srv === "s40" && type === "tv" && season && episode) {
        const url = `${BINGR_API_BASE}/stream/aphelion-tv/${tmdbId}/${season}/${episode}`;
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            Referer: "https://bingr.one/",
            Origin: "https://bingr.one",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(2800),
        });
        if (res.status === 429) {
          bingrCooldownUntil = Date.now() + 25_000;
          break;
        }
        if (res.ok) {
          data = (await res.json()) as BingrStreamResponse;
        }
      }

      // Universal POST endpoint
      if (!data || !data.sources?.length) {
        const body: Record<string, unknown> = {
          srv: srvConfig.srv,
          t: type,
          id: String(tmdbId),
          imdbId: imdbId || undefined,
          query: {
            title: title || "",
            year: year || "",
            imdbId: imdbId || "",
            ...(type === "tv"
              ? { season: String(season), episode: String(episode) }
              : {}),
          },
        };

        const res = await fetch(`${BINGR_API_BASE}/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            Referer: "https://bingr.one/",
            Origin: "https://bingr.one",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(2800),
        });

        if (res.status === 429) {
          bingrCooldownUntil = Date.now() + 25_000;
          break;
        }

        if (res.ok) {
          data = (await res.json()) as BingrStreamResponse;
        }
      }

      if (data?.sources && data.sources.length > 0) {
        const source = data.sources[0];
        if (!source || !source.url) continue;

        const directUrl = unwrapDirectStreamUrl(source.url);
        const isDirect = checkIsDirectCors(directUrl);
        const isFile = source.type === "video/mp4" || source.isMP4 === true || directUrl.includes(".mp4");
        const is4K = (source.quality || "").toLowerCase().includes("4k") || (source.name || "").includes("4K");

        // Format captions
        const captions: Array<{ label: string; language: string; url: string }> = [];
        if (data.subtitles && Array.isArray(data.subtitles)) {
          for (const sub of data.subtitles) {
            if (!sub.url) continue;
            captions.push({
              label: sub.label || sub.lang || "Subtitles",
              language: sub.lang || "en",
              url: sub.url,
            });
          }
        }

        return {
          serverName: srvConfig.name,
          serverId: srvKey,
          url: directUrl,
          kind: isFile ? "file" : "hls",
          is4K,
          quality: source.quality,
          referer: source.headers?.Referer || source.headers?.referer || "https://bingr.one/",
          headers: source.headers,
          captions,
          isDirectCors: isDirect,
        };
      }
    } catch {
      // Continue to next server in cascade
      continue;
    }
  }

  return null;
}
