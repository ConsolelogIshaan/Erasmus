import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import {
  resolveCinejoyStream,
  type CinejoyCaption,
} from "@/lib/streaming/cinejoy-stream";
import { resolveVidfastDirectStream } from "@/lib/streaming/vidfast-direct";

export interface DirectServer {
  name: string;
  url: string;
  ms?: number;
  kind?: "hls" | "file";
}

export interface DirectStreamResult {
  ok: boolean;
  error?: string;
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
}): Promise<DirectStreamResult> {
  const cacheKey = `${input.serverId ?? "lisbon"}:${input.type}:${input.tmdbId}:${input.season ?? 1}:${input.episode ?? 1}`;
  const cached = extractCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return cached.result;
  }

  const started = Date.now();
  try {
    // 1. Primary: VidFast direct stream resolver (high-bitrate 4K/1080p HLS)
    const vidfastHit = await resolveVidfastDirectStream(input);
    if (vidfastHit?.url) {
      const result: DirectStreamResult = {
        ok: true,
        referer: vidfastHit.referer,
        servers: [
          {
            name: vidfastHit.serverName,
            url: vidfastHit.url,
            kind: vidfastHit.kind,
            ms: Date.now() - started,
          },
        ],
      };
      extractCache.set(cacheKey, { at: Date.now(), result });
      return result;
    }

    // 2. Secondary: Cinejoy/Shegu stream resolver
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

    return { ok: false, error: "no stream", servers: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "resolve failed";
    return { ok: false, error: message, servers: [] };
  }
}
