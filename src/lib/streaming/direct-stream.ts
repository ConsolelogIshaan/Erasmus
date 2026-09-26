import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import {
  resolveCinejoyStream,
  resolveCinejoyClusterStream,
  type CinejoyCaption,
} from "@/lib/streaming/cinejoy-stream";
import { resolveVidfastDirectStream } from "@/lib/streaming/vidfast-direct";
import {
  resolveBingrStream,
  BINGR_SERVERS,
} from "@/lib/streaming/bingr-stream";
import { isCinejoyServer } from "@/lib/streaming/stream-resolver";
import { getMovie, getTvShow } from "@/lib/media/catalog";

export interface DirectServer {
  name: string;
  url: string;
  ms?: number;
  kind?: "hls" | "file";
  is4K?: boolean;
  hdUrl?: string;
  fourKUrl?: string;
  isDirectCors?: boolean;
}

export interface DirectStreamResult {
  ok: boolean;
  error?: string;
  debug?: string;
  referer?: string;
  captions?: CinejoyCaption[];
  servers: DirectServer[];
}

const extractCache = new Map<string, { at: number; result: DirectStreamResult }>();
const CACHE_MS = 3 * 60 * 1000;

export async function extractDirectStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverId?: string;
  title?: string;
  year?: string;
  imdbId?: string;
  anilistId?: number;
}): Promise<DirectStreamResult> {
  const effectiveServerId = input.serverId ?? "lisbon";
  const cacheKey = `${effectiveServerId}:${input.type}:${input.tmdbId}:${input.season ?? 1}:${input.episode ?? 1}`;
  const cached = extractCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.result;
  }

  const started = Date.now();
  let debugLog = "";
  const isBingrServer = BINGR_SERVERS.includes(effectiveServerId.toLowerCase());
  const isCinejoy = isCinejoyServer(effectiveServerId);

  let title = input.title;
  let year = input.year;
  let imdbId = input.imdbId;

  const getEnriched = async () => {
    if (!title || !year || !imdbId) {
      try {
        if (input.type === "movie") {
          const details = await getMovie(input.tmdbId);
          if (details) {
            title = title || details.title;
            year = year || (details.releaseDate ? details.releaseDate.slice(0, 4) : undefined);
            imdbId = imdbId || details.imdbId || undefined;
          }
        } else {
          const details = await getTvShow(input.tmdbId);
          if (details) {
            title = title || details.title;
            year = year || (details.firstAirDate ? details.firstAirDate.slice(0, 4) : undefined);
            imdbId = imdbId || details.imdbId || undefined;
          }
        }
      } catch {}
    }
    return {
      ...input,
      title,
      year,
      imdbId,
    };
  };

  try {
    // 0. If a Cinejoy server is explicitly requested, try Cinejoy cluster first
    if (isCinejoy) {
      try {
        const enriched = await getEnriched();
        const cjHit = await resolveCinejoyClusterStream({
          ...enriched,
          serverId: effectiveServerId,
        });
        if (cjHit?.url) {
          const result: DirectStreamResult = {
            ok: true,
            referer: cjHit.referer,
            captions: cjHit.captions,
            servers: [
              {
                name: cjHit.serverName,
                url: cjHit.url,
                kind: cjHit.kind,
                is4K: cjHit.is4K,
                hdUrl: cjHit.hdUrl,
                fourKUrl: cjHit.fourKUrl,
                isDirectCors: cjHit.isDirectCors,
                ms: Date.now() - started,
              },
            ],
          };
          extractCache.set(cacheKey, { at: Date.now(), result });
          return result;
        }
      } catch (err) {
        debugLog += `cinejoy-cluster: ${err instanceof Error ? err.message : "failed"}; `;
      }
    }

    // 1. If a Bingr server is explicitly requested, try Bingr cluster first
    if (isBingrServer) {
      try {
        const enriched = await getEnriched();
        const bingrHit = await resolveBingrStream({
          ...enriched,
          serverId: effectiveServerId,
        });
        if (bingrHit?.url) {
          const result: DirectStreamResult = {
            ok: true,
            referer: bingrHit.referer,
            captions: bingrHit.captions,
            servers: [
              {
                name: bingrHit.serverName,
                url: bingrHit.url,
                kind: bingrHit.kind,
                is4K: bingrHit.is4K,
                isDirectCors: bingrHit.isDirectCors,
                ms: Date.now() - started,
              },
            ],
          };
          extractCache.set(cacheKey, { at: Date.now(), result });
          return result;
        }
      } catch (err) {
        debugLog += `bingr: ${err instanceof Error ? err.message : "failed"}; `;
      }
    }

    // 2. VidFast direct stream resolver (Flagship Lisbon 4K/1080p HLS)
    const vidfastRes = await resolveVidfastDirectStream(input);
    if (vidfastRes.hit?.url) {
      const result: DirectStreamResult = {
        ok: true,
        referer: vidfastRes.hit.referer,
        servers: [
          {
            name: vidfastRes.hit.serverName,
            url: vidfastRes.hit.url,
            kind: vidfastRes.hit.kind,
            is4K: vidfastRes.hit.is4K,
            hdUrl: vidfastRes.hit.hdUrl,
            fourKUrl: vidfastRes.hit.fourKUrl,
            isDirectCors: false,
            ms: Date.now() - started,
          },
        ],
      };
      extractCache.set(cacheKey, { at: Date.now(), result });
      return result;
    }
    if (vidfastRes.debug) debugLog += `vidfast: ${vidfastRes.debug}; `;

    // 3. Fallback to Bingr cluster if not already tried
    if (!isBingrServer) {
      try {
        const enriched = await getEnriched();
        const bingrHit = await resolveBingrStream({
          ...enriched,
          serverId: "aphelion",
        });
        if (bingrHit?.url) {
          const result: DirectStreamResult = {
            ok: true,
            referer: bingrHit.referer,
            captions: bingrHit.captions,
            servers: [
              {
                name: bingrHit.serverName,
                url: bingrHit.url,
                kind: bingrHit.kind,
                is4K: bingrHit.is4K,
                isDirectCors: bingrHit.isDirectCors,
                ms: Date.now() - started,
              },
            ],
          };
          extractCache.set(cacheKey, { at: Date.now(), result });
          return result;
        }
      } catch (err) {
        debugLog += `bingr-fallback: ${err instanceof Error ? err.message : "failed"}; `;
      }
    }

    // 4. Secondary: Cinejoy/Shegu stream resolver
    const hit = await resolveCinejoyStream(input);
    if (hit?.url) {
      const result: DirectStreamResult = {
        ok: true,
        referer: hit.referer,
        captions: hit.captions,
        servers: [
          {
            name: hit.serverName,
            url: hit.url,
            kind: hit.kind,
            ms: Date.now() - started,
          },
        ],
      };
      extractCache.set(cacheKey, { at: Date.now(), result });
      return result;
    }

    return { ok: false, error: "no stream", debug: debugLog, servers: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "resolve failed";
    return { ok: false, error: message, debug: debugLog, servers: [] };
  }
}
