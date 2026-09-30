import type { VidcoreBrowser } from "./vidcore-cloud";
import type { VidcoreRelay } from "./vidcore-direct";
import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import {
  resolveCinejoyStream,
  resolveCinejoyClusterStream,
  resolveVidlinkStream,
  type CinejoyCaption,
} from "@/lib/streaming/cinejoy-stream";
import { resolveVidfastDirectStream } from "@/lib/streaming/vidfast-direct";
import { resolveVidcoreDirectStream } from "@/lib/streaming/vidcore-direct";
import {
  resolveBingrStream,
  BINGR_SERVERS,
} from "@/lib/streaming/bingr-stream";
import { isCinejoyServer } from "@/lib/streaming/stream-resolver";
import { getMovie, getTvShow } from "@/lib/media/catalog";
import { CLOUDFLARE_HLS_RELAY } from "@/lib/streaming/relay";

export interface DirectServer {
  name: string;
  url: string;
  ms?: number;
  kind?: "hls" | "file";
  is4K?: boolean;
  hdUrl?: string;
  fourKUrl?: string;
  isDirectCors?: boolean;
  cloudOnly?: boolean;
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
  // If the cached entry is a degraded non-4K fallback for a 4K server like Lisbon,
  // expire it in only 10 seconds so turning on the PC upgrades immediately!
  const isDegradedCached = effectiveServerId === "lisbon" && !cached?.result.servers.some((s) => s.is4K);
  const effectiveCacheMs = isDegradedCached ? 10_000 : CACHE_MS;
  if (cached && Date.now() - cached.at < effectiveCacheMs) {
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
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
        if (input.type === "movie") {
          const details = await Promise.race([getMovie(input.tmdbId), timeoutPromise]);
          if (details) {
            title = title || details.title;
            year = year || (details.releaseDate ? details.releaseDate.slice(0, 4) : undefined);
            imdbId = imdbId || details.imdbId || undefined;
          }
        } else {
          const details = await Promise.race([getTvShow(input.tmdbId), timeoutPromise]);
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
    if (effectiveServerId === "vidcore") {
      try {
        const { getCloudflareContext } = await import("@opennextjs/cloudflare");
        const context = getCloudflareContext();
        const env = context.env as unknown as { VIDCORE_BROWSER?: VidcoreBrowser; HLS_RELAY?: VidcoreRelay };
        const browser = env.VIDCORE_BROWSER;
        if (!browser) throw new Error("VidCore cloud browser binding unavailable");
        // Next dev probes the public cloud-only relay; deployed Workers use the
        // service binding to avoid same-zone public Worker fetch restrictions.
        const hit = await resolveVidcoreDirectStream(input, browser, process.env.NODE_ENV === "development" ? undefined : env.HLS_RELAY);
        if (!hit) return { ok: false, error: "No playable Cloudflare media source available on VidCore", servers: [] };
        const result: DirectStreamResult = {
          ok: true,
          referer: "https://vidcore.io/",
          captions: hit.captions,
          // Already wrapped in the public Cloudflare cloud-only relay. Do not
          // rewrap into localhost or the residential tunnel during preparation.
          servers: [{ name: "VidCore", url: hit.url, kind: "hls", is4K: hit.is4K, ms: Date.now() - started }],
          debug: `VidCore mirror: ${hit.mirror}; discovery: Cloudflare Browser Run; media: Cloudflare cloud-edge`,
        };
        extractCache.set(cacheKey, { at: Date.now(), result });
        return result;
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "VidCore unavailable", servers: [] };
      }
    }
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
          strictServer: true,
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
                cloudOnly: true,
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
      return { ok: false, error: "Selected server is unavailable through Cloudflare", debug: debugLog, servers: [] };
    }

    // On Cloudflare Workers (workerd), vidfast.vc blocks worker datacenter IPs with 403 Forbidden.
    // Detecting Cloudflare skips the 5,000ms wasted 403 timeout and routes directly to the Vercel resolver.
    const isCloudflare =
      (typeof globalThis !== "undefined" && "WebSocketPair" in globalThis) ||
      Boolean(process.env.NEXT_PUBLIC_IS_CLOUDFLARE) ||
      (typeof navigator !== "undefined" && navigator.userAgent?.includes("Cloudflare-Workers"));

    if (!isCloudflare) {
      const vidfastRes = await resolveVidfastDirectStream(input);
      if (vidfastRes.hit?.url) {
        // Quality Floor / Upgrade for Lisbon:
        // If VidFast only yielded a sub-1080p fallback stream (e.g. Cobra or Horizon 720p),
        // check if Vidlink has a pristine 1080p Full HD stream so Lisbon users receive full 1080p.
        const isLowResFallback =
          !vidfastRes.hit.is4K &&
          (vidfastRes.hit.serverName.toLowerCase() === "bravo" ||
            vidfastRes.hit.serverName.toLowerCase() === "cobra" ||
            vidfastRes.hit.serverName.toLowerCase() === "horizon");

        if (isLowResFallback && (effectiveServerId === "lisbon" || !effectiveServerId)) {
          try {
            const vidlinkHit = await resolveVidlinkStream({
              type: input.type,
              tmdbId: input.tmdbId,
              season: input.season,
              episode: input.episode,
              serverName: "Lisbon",
            });
            if (vidlinkHit?.url) {
              const result: DirectStreamResult = {
                ok: true,
                referer: vidlinkHit.referer,
                captions: vidlinkHit.captions,
                servers: [
                  {
                    name: "Lisbon",
                    url: vidlinkHit.url,
                    kind: vidlinkHit.kind,
                    is4K: vidlinkHit.is4K,
                    hdUrl: vidlinkHit.url,
                    fourKUrl: undefined,
                    isDirectCors: vidlinkHit.isDirectCors,
                    ms: Date.now() - started,
                  },
                ],
              };
              extractCache.set(cacheKey, { at: Date.now(), result });
              return result;
            }
          } catch {
            // Vidlink upgrade failed, proceed with VidFast stream
          }
        }

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
    } else {
      // 2.5 Bridge Resolver (Cloudflare Pages/Worker):
      // Queries the active PC tunnel bridge over Reliance Jio residential IP.
      // Returns authentic 4K vRapid master playlist with ZERO Vercel involvement.
      try {
        const relayBase =
          process.env.NEXT_PUBLIC_HLS_RELAY_URL?.trim() ||
          CLOUDFLARE_HLS_RELAY;

        const vParams = new URLSearchParams({
          id: input.tmdbId,
          type: input.type,
          server: effectiveServerId,
        });
        if (input.season) vParams.set("season", String(input.season));
        if (input.episode) vParams.set("episode", String(input.episode));
        if (title) vParams.set("title", title);
        if (year) vParams.set("year", year);
        if (imdbId) vParams.set("imdb", imdbId);

        let bridgeRes: Response | null = null;

        // Strategy A: Cloudflare Context (Edge KV or Service Binding)
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { getCloudflareContext } = require("@opennextjs/cloudflare");
          const cf = getCloudflareContext();
          const cfEnv = cf?.env as
            | {
                RELAY_CONFIG?: { get: (key: string) => Promise<string | null> };
                HLS_RELAY?: { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
              }
            | undefined;

          // A1: Check KV for active quick tunnel URL (bypasses worker-to-worker subrequest limits)
          if (cfEnv?.RELAY_CONFIG) {
            const targetUrl = await cfEnv.RELAY_CONFIG.get("TARGET_URL");
            if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
              try {
                bridgeRes = await fetch(`${targetUrl.replace(/\/+$/, "")}/api/stream/direct?${vParams.toString()}`, {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  signal: AbortSignal.timeout(12000),
                });
              } catch {}
            }
          }

          // A2: Service Binding direct in-memory invocation
          if ((!bridgeRes || !bridgeRes.ok) && cfEnv?.HLS_RELAY?.fetch) {
            try {
              bridgeRes = await cfEnv.HLS_RELAY.fetch(
                `https://erasmus-hls-relay/api/stream/direct?${vParams.toString()}`,
                {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  signal: AbortSignal.timeout(12000),
                },
              );
            } catch {}
          }
        } catch {
          // Outside OpenNext Cloudflare runtime (e.g. local dev / build)
        }

        // Strategy B: Standard fetch to relayBase
        if ((!bridgeRes || !bridgeRes.ok) && relayBase && relayBase.startsWith("http")) {
          try {
            bridgeRes = await fetch(
              `${relayBase}/api/stream/direct?${vParams.toString()}`,
              {
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(12000),
              },
            );
          } catch {}
        }

        if (bridgeRes && bridgeRes.ok) {
          const bridgeData = (await bridgeRes.json()) as DirectStreamResult;
          if (bridgeData.ok && bridgeData.servers?.length > 0 && bridgeData.servers[0]?.url) {
            const vServer = bridgeData.servers[0];
            const isBastionOnNonBingr = !isBingrServer && vServer.name?.toLowerCase().includes("bastion");
            if (!isBastionOnNonBingr) {
              extractCache.set(cacheKey, { at: Date.now(), result: bridgeData });
              return bridgeData;
            }
          }
        }
      } catch (bridgeErr) {
        debugLog += `bridge-resolver: ${bridgeErr instanceof Error ? bridgeErr.message : "failed"}; `;
      }
    }

    // 2.6. Vidlink pristine 1080p edge stream for Lisbon and non-Bingr servers
    if (!isBingrServer || effectiveServerId === "nebula" || effectiveServerId === "lisbon") {
      try {
        const vidlinkHit = await resolveVidlinkStream({
          type: input.type,
          tmdbId: input.tmdbId,
          season: input.season,
          episode: input.episode,
          serverName: effectiveServerId === "nebula" ? "Nebula" : "Lisbon",
        });
        // Allow Vidlink pristine streams (including authentic 1080p Hakuna Matata streams)
        if (vidlinkHit?.url) {
          const result: DirectStreamResult = {
            ok: true,
            referer: vidlinkHit.referer,
            captions: vidlinkHit.captions,
            servers: [
              {
                name: effectiveServerId === "nebula" ? "Nebula" : (effectiveServerId === "lisbon" ? "Lisbon" : vidlinkHit.serverName),
                url: vidlinkHit.url,
                kind: vidlinkHit.kind,
                is4K: vidlinkHit.is4K,
                hdUrl: vidlinkHit.hdUrl,
                fourKUrl: vidlinkHit.fourKUrl,
                isDirectCors: vidlinkHit.isDirectCors,
                ms: Date.now() - started,
              },
            ],
          };
          extractCache.set(cacheKey, { at: Date.now(), result });
          return result;
        }
      } catch (err) {
        debugLog += `vidlink-fallback: ${err instanceof Error ? err.message : "failed"}; `;
      }
    }

    // 3 & 4. Fallback to Bingr and Cinejoy in parallel if not already resolved
    const fallbackTasks: Promise<DirectStreamResult | null>[] = [];

    if (!isBingrServer) {
      fallbackTasks.push(
        (async () => {
          try {
            const enriched = await getEnriched();
            const fallbackTarget = effectiveServerId === "nebula" ? "bastion" : "aphelion";
            const bingrHit = await resolveBingrStream({
              ...enriched,
              serverId: fallbackTarget,
            });
            // Guard against Bastion wrong-movie/remake collision:
            // Bastion mistakenly returns the 2021 HBO Max reboot for TMDB 1395 (Gossip Girl 2007).
            const isTvShow = input.type === "tv";
            const isGossipGirlOriginal = input.tmdbId.trim() === "1395";
            const isBastionRemake = isGossipGirlOriginal && bingrHit?.serverId === "bastion";
            if (
              bingrHit?.url &&
              !isBastionRemake &&
              (bingrHit.serverId !== "bastion" || isTvShow || effectiveServerId === "nebula")
            ) {
              return {
                ok: true,
                referer: bingrHit.referer,
                captions: bingrHit.captions,
                servers: [
                  {
                    name: effectiveServerId === "nebula" ? "Nebula" : bingrHit.serverName,
                    url: bingrHit.url,
                    kind: bingrHit.kind,
                    is4K: bingrHit.is4K,
                    isDirectCors: bingrHit.isDirectCors,
                    ms: Date.now() - started,
                  },
                ],
              };
            }
          } catch (err) {
            debugLog += `bingr-fallback: ${err instanceof Error ? err.message : "failed"}; `;
          }
          return null;
        })(),
      );
    }

    fallbackTasks.push(
      (async () => {
        try {
          const hit = await resolveCinejoyStream(input);
          if (hit?.url) {
            return {
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
          }
        } catch (err) {
          debugLog += `cinejoy: ${err instanceof Error ? err.message : "failed"}; `;
        }
        return null;
      })(),
    );

    const fallbackResults = await Promise.all(fallbackTasks);
    const validFallback = fallbackResults.find((r): r is DirectStreamResult => Boolean(r?.ok));
    if (validFallback) {
      extractCache.set(cacheKey, { at: Date.now(), result: validFallback });
      return validFallback;
    }

    return { ok: false, error: "no stream", debug: debugLog, servers: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "resolve failed";
    return { ok: false, error: message, debug: debugLog, servers: [] };
  }
}
