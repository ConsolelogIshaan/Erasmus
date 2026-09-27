/**
 * Low-level TMDB HTTP client.
 *
 * Uses public DNS (8.8.8.8 / 1.1.1.1) when resolving api.themoviedb.org because
 * some ISP resolvers return non-routable or black-hole IPs that cause
 * ConnectTimeoutError and empty catalog UIs.
 */

import { Resolver } from "node:dns/promises";
import https from "node:https";
import { URL } from "node:url";

const TMDB_BASE = "https://api.themoviedb.org/3";
const PUBLIC_DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "9.9.9.9"];
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

export class TmdbError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export interface TmdbClientOptions {
  apiKey?: string;
  accessToken?: string;
  /** Default revalidate seconds for fetch cache (kept for API compatibility). */
  revalidate?: number;
}

function resolveCredentials(): { apiKey?: string; accessToken?: string } {
  return {
    apiKey: process.env.TMDB_API_KEY,
    accessToken: process.env.TMDB_READ_ACCESS_TOKEN,
  };
}

export function isTmdbConfigured(): boolean {
  const { apiKey, accessToken } = resolveCredentials();
  return Boolean(apiKey || accessToken);
}

let publicResolver: Resolver | null = null;
try {
  publicResolver = new Resolver();
  publicResolver.setServers(PUBLIC_DNS_SERVERS);
} catch {
  publicResolver = null;
}

type IpCacheEntry = { ips: string[]; expiresAt: number };
const ipCache = new Map<string, IpCacheEntry>();
const IP_CACHE_TTL_MS = 5 * 60 * 1000;

async function resolveIpv4(hostname: string): Promise<string[]> {
  if (!publicResolver) return [];
  const cached = ipCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ips;
  }

  try {
    const ips = await publicResolver.resolve4(hostname);
    if (ips.length > 0) {
      ipCache.set(hostname, { ips, expiresAt: Date.now() + IP_CACHE_TTL_MS });
      return ips;
    }
  } catch (error) {
    console.warn(
      `[tmdb] public DNS resolve failed for ${hostname}:`,
      error instanceof Error ? error.message : error,
    );
  }

  return [];
}

interface RawHttpResponse {
  status: number;
  statusText: string;
  body: string;
}

async function requestOnce(
  url: URL,
  headers: Record<string, string>,
  address: string | null,
): Promise<RawHttpResponse> {
  if (!address || typeof https?.request !== "function") {
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return {
      status: res.status,
      statusText: res.statusText,
      body: await res.text(),
    };
  }

  const hostname = url.hostname;
  const connectHost = address ?? hostname;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: connectHost,
        servername: hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          ...headers,
          Host: hostname,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            statusText: res.statusMessage ?? "",
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(
        new Error(
          `TMDB connect/read timed out after ${REQUEST_TIMEOUT_MS}ms (${connectHost})`,
        ),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

async function resilientGet(
  url: URL,
  headers: Record<string, string>,
): Promise<RawHttpResponse> {
  const isCloudflare = Boolean(
    process.env.NEXT_PUBLIC_IS_CLOUDFLARE === "true" ||
    "WebSocketPair" in globalThis
  );

  // In Cloudflare Workers, Cloudflare edge handles DNS globally with zero ISP blocking.
  // Standard native fetch() connects directly in ~50ms without raw socket emulation.
  if (isCloudflare) {
    try {
      const res = await fetch(url.toString(), {
        headers,
        signal: AbortSignal.timeout(6000),
        // Cache TMDB JSON responses in Cloudflare edge Anycast cache (5 min TTL)
        cf: {
          cacheEverything: true,
          cacheTtl: 300,
        },
      } as RequestInit);
      return {
        status: res.status,
        statusText: res.statusText,
        body: await res.text(),
      };
    } catch (error) {
      console.warn(
        `[tmdb] Cloudflare native fetch failed for ${url.pathname}:`,
        error instanceof Error ? error.message : error,
      );
      throw new TmdbError(
        error instanceof Error ? error.message : "TMDB fetch failed on Cloudflare",
        0,
        url.pathname,
      );
    }
  }

  const ips = await resolveIpv4(url.hostname);
  const targets: Array<string | null> =
    ips.length > 0 ? ips.slice(0, 3) : [null];

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const address = targets[attempt % targets.length] ?? null;
    try {
      return await requestOnce(url, headers, address);
    } catch (error) {
      lastError = error;
      // brief backoff before next IP / attempt
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }

  const message =
    lastError instanceof Error
      ? lastError.message
      : "TMDB request failed after retries";
  throw new TmdbError(message, 0, url.pathname);
}

type TmdbCacheEntry = { data: unknown; expiresAt: number };
const tmdbResponseCache = new Map<string, TmdbCacheEntry>();
const tmdbInflightRequests = new Map<string, Promise<unknown>>();
const TMDB_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_TMDB_CACHE_ENTRIES = 300;

/**
 * GET a TMDB v3 endpoint. Returns null on 404; throws on other errors.
 * Includes in-memory TTL caching and inflight deduplication to avoid hitting
 * Cloudflare Worker subrequest limits (Error 1200).
 */
export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: TmdbClientOptions = {},
): Promise<T | null> {
  const { apiKey, accessToken } = {
    ...resolveCredentials(),
    ...options,
  };

  if (!apiKey && !accessToken) {
    throw new TmdbError(
      "TMDB is not configured. Set TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN.",
      0,
      path,
    );
  }

  const url = new URL(`${TMDB_BASE}${path.startsWith("/") ? path : `/${path}`}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  if (apiKey && !accessToken) {
    url.searchParams.set("api_key", apiKey);
  }

  const cacheKey = url.toString();
  const cached = tmdbResponseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const inflight = tmdbInflightRequests.get(cacheKey);
  if (inflight) {
    return (await inflight) as T | null;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const executeFetch = async (): Promise<T | null> => {
    try {
      const response = await resilientGet(url, headers);

      if (response.status === 404) {
        return null;
      }

      if (response.status < 200 || response.status >= 300) {
        throw new TmdbError(
          `TMDB ${response.status}: ${response.body.slice(0, 200) || response.statusText}`,
          response.status,
          path,
        );
      }

      try {
        const data = JSON.parse(response.body) as T;
        if (tmdbResponseCache.size >= MAX_TMDB_CACHE_ENTRIES) {
          tmdbResponseCache.clear();
        }
        tmdbResponseCache.set(cacheKey, { data, expiresAt: Date.now() + TMDB_CACHE_TTL_MS });
        return data;
      } catch {
        throw new TmdbError("TMDB returned invalid JSON", response.status, path);
      }
    } finally {
      tmdbInflightRequests.delete(cacheKey);
    }
  };

  const promise = executeFetch();
  tmdbInflightRequests.set(cacheKey, promise);
  return promise;
}
