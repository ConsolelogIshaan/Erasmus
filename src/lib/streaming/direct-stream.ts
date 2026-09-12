import {
  resolveCinejoyStream,
  type CinejoyCaption,
} from "@/lib/streaming/cinejoy-stream";

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
const CACHE_MS = 10 * 60 * 1000;

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
    const hit = await resolveCinejoyStream(input);
    if (!hit) {
      return { ok: false, error: "no stream", servers: [] };
    }
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "resolve failed";
    return { ok: false, error: message, servers: [] };
  }
}
