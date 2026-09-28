/**
 * Erasmus HLS Relay — Dynamic Smart Router & Cloudflare Edge Worker
 * =================================================================
 *
 * Architecture:
 * 1. Client plays video -> requests stream from Cloudflare Worker.
 * 2. If user's residential PC tunnel is active (via Cloudflare Quick Tunnel),
 *    Worker transparently proxies request through the tunnel to user's PC.
 *    User's PC fetches video segments from VidFast over Reliance Jio residential IP (never blocked).
 *    Result: 0 bytes on Vercel, $0 cost, unlimited 4K bandwidth.
 * 3. If user's PC is offline:
 *    Direct edge fetch handles open CDNs (Aphelion, Bastion, Vidlink).
 *    ZERO Vercel dependency — Vercel is completely eliminated.
 * 4. Zero Supabase queries, zero schema changes, zero database egress.
 */

const SYNC_SECRET = "erasmus_relay_tunnel_key_9247f1";
const HEARTBEAT_EXPIRY_MS = 90 * 1000; // 90 seconds max for fast failover when PC is off
const DEFAULT_REFERER = "https://cinejoy.to/";

// In-memory cache for ultra-fast (0ms) routing without KV read latency on every chunk
let cachedTarget = null;
let cachedPing = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function isAuthorized(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth === `Bearer ${SYNC_SECRET}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === SYNC_SECRET) return true;
  return false;
}

function isHttpsUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function refererFor(requested) {
  if (requested) {
    const parsed = isHttpsUrl(requested);
    if (parsed) {
      return { referer: `${parsed.origin}/`, origin: parsed.origin };
    }
  }
  return { referer: DEFAULT_REFERER, origin: "https://cinejoy.to" };
}

function proxied(relayBase, absolute, referer) {
  const query = new URLSearchParams({ url: absolute });
  if (referer) query.set("referer", referer);
  return `${relayBase}?${query.toString()}`;
}

function isSrtText(text) {
  const trimmed = text.trimStart().replace(/^\uFEFF/, "");
  if (trimmed.startsWith("WEBVTT")) return false;
  return /^\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,.]/.test(trimmed);
}

function srtToVtt(text) {
  const body = text
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "")
    .trim();
  const stamped = body.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  if (stamped.startsWith("WEBVTT")) return stamped;
  return `WEBVTT\n\n${stamped}\n`;
}

function enrichAudioTracks(text) {
  const lines = text.split("\n");
  const audioIndices = [];
  lines.forEach((l, idx) => {
    if (l.trim().startsWith("#EXT-X-MEDIA:") && l.includes("TYPE=AUDIO")) {
      audioIndices.push(idx);
    }
  });

  if (audioIndices.length <= 1) return text;

  let hasExplicitEnglish = false;
  let englishLineIdx = -1;

  audioIndices.forEach((idx) => {
    const l = lines[idx] ?? "";
    if (
      /LANGUAGE="?(en|eng|english)"?/i.test(l) ||
      /NAME="?[^"]*(english|\beng\b)[^"]*"/i.test(l)
    ) {
      hasExplicitEnglish = true;
      englishLineIdx = idx;
    }
  });

  const targetEnglishIdx = hasExplicitEnglish ? englishLineIdx : audioIndices[1];

  audioIndices.forEach((idx) => {
    let l = lines[idx] ?? "";
    if (idx === targetEnglishIdx) {
      l = l.replace(/DEFAULT=(YES|NO)/i, "DEFAULT=YES");
      l = l.replace(/AUTOSELECT=(YES|NO)/i, "AUTOSELECT=YES");
      if (!/LANGUAGE="[^"]+"/i.test(l)) {
        l = l.replace(/NAME="([^"]+)"/i, 'NAME="English ($1)",LANGUAGE="en"');
      }
    } else {
      l = l.replace(/DEFAULT=(YES|NO)/i, "DEFAULT=NO");
    }
    lines[idx] = l;
  });

  return lines.join("\n");
}

function rewritePlaylist(text, baseUrl, relayBase, referer) {
  const enriched = enrichAudioTracks(text);
  return enriched
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri) => {
          const absolute = new URL(uri, baseUrl).href;
          return `URI="${proxied(relayBase, absolute, referer)}"`;
        });
      }
      const absolute = new URL(trimmed, baseUrl).href;
      return proxied(relayBase, absolute, referer);
    })
    .join("\n");
}

async function getActiveTunnel(env) {
  const now = Date.now();
  // Fast path: cached in worker isolate memory and active
  if (cachedTarget && (now - cachedPing < HEARTBEAT_EXPIRY_MS)) {
    return cachedTarget;
  }

  // Read from KV if available
  if (env && env.RELAY_CONFIG) {
    try {
      const target = await env.RELAY_CONFIG.get("TARGET_URL");
      const pingStr = await env.RELAY_CONFIG.get("LAST_PING");
      const ping = pingStr ? parseInt(pingStr, 10) : 0;
      if (target) {
        cachedTarget = target;
        cachedPing = ping;
        if (now - ping < HEARTBEAT_EXPIRY_MS) {
          return target;
        }
      }
    } catch (err) {
      console.warn("[Worker] KV read error:", err);
    }
  }

  return cachedTarget;
}

const worker = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;

    // --- ENDPOINT: /set-target (Called by local sync script) ---
    if (pathname === "/set-target" && request.method === "POST") {
      if (!isAuthorized(request)) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      try {
        const body = await request.json();
        let target = (body.target || "").trim();
        if (!target.startsWith("http://") && !target.startsWith("https://")) {
          return jsonResponse({ error: "invalid target url" }, 400);
        }

        target = target.replace(/\/+$/, "");
        const now = Date.now();

        // Update in-memory cache
        cachedTarget = target;
        cachedPing = now;

        // Persist to KV
        if (env && env.RELAY_CONFIG) {
          ctx.waitUntil(
            Promise.all([
              env.RELAY_CONFIG.put("TARGET_URL", target),
              env.RELAY_CONFIG.put("LAST_PING", now.toString()),
            ])
          );
        }

        return jsonResponse({
          status: "ok",
          message: "Target tunnel configured successfully",
          target,
          timestamp: now,
        });
      } catch (err) {
        return jsonResponse({ error: "bad request", details: err.message }, 400);
      }
    }

    // --- ENDPOINT: /ping (Heartbeat from local PC) ---
    if (pathname === "/ping" && (request.method === "POST" || request.method === "GET")) {
      if (!isAuthorized(request)) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }

      const now = Date.now();
      cachedPing = now;

      if (env && env.RELAY_CONFIG) {
        ctx.waitUntil(env.RELAY_CONFIG.put("LAST_PING", now.toString()));
      }

      return jsonResponse({ status: "ok", ping: now, target: cachedTarget });
    }

    // --- ENDPOINT: /status or /health ---
    if (pathname === "/status" || pathname === "/health") {
      const now = Date.now();
      const target = await getActiveTunnel(env);
      const isAlive = Boolean(target && (now - cachedPing < HEARTBEAT_EXPIRY_MS));

      return jsonResponse({
        status: "ok",
        service: "Erasmus HLS Dynamic Smart Relay",
        activeTunnel: target || "none",
        isTunnelAlive: isAlive,
        secondsSincePing: Math.round((now - cachedPing) / 1000),
        vercelFree: true,
      });
    }

    // --- ENDPOINT: /tunnel-url ---
    if (pathname === "/tunnel-url") {
      const target = await getActiveTunnel(env);
      const now = Date.now();
      const isAlive = Boolean(target && (now - cachedPing < HEARTBEAT_EXPIRY_MS));
      return jsonResponse({ ok: isAlive, tunnelUrl: target || null, isAlive });
    }

    // --- ENDPOINT: /api/stream/direct or /resolve-direct ---
    if (pathname === "/api/stream/direct" || pathname === "/resolve-direct") {
      const target = await getActiveTunnel(env);
      const now = Date.now();
      const isAlive = Boolean(target && (now - cachedPing < HEARTBEAT_EXPIRY_MS));
      if (isAlive) {
        try {
          const directTargetUrl = `${target}${pathname}${requestUrl.search}`;
          const dRes = await fetch(directTargetUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(3500),
          });
          const dData = await dRes.text();
          return new Response(dData, {
            status: dRes.status,
            headers: {
              "Content-Type": "application/json",
              ...CORS_HEADERS,
            },
          });
        } catch (dErr) {
          return jsonResponse({ ok: false, error: "tunnel direct resolver failed", details: dErr.message }, 502);
        }
      }
      return jsonResponse({ ok: false, error: "residential bridge offline" }, 503);
    }

    // --- STREAMING VIDEO RELAY LOGIC ---
    const rawTarget = requestUrl.searchParams.get("url");
    if (!rawTarget) {
      return jsonResponse({ error: "missing url query parameter" }, 400);
    }

    const activeTunnel = await getActiveTunnel(env);
    const now = Date.now();
    const isTunnelAlive = Boolean(activeTunnel && (now - cachedPing < HEARTBEAT_EXPIRY_MS));

    // Path 1: Forward to local residential PC tunnel (Zero-Vercel mode)
    if (isTunnelAlive) {
      try {
        const tunnelTargetUrl = new URL(request.url);
        const parsedTunnel = new URL(activeTunnel);
        tunnelTargetUrl.protocol = parsedTunnel.protocol;
        tunnelTargetUrl.host = parsedTunnel.host;
        tunnelTargetUrl.port = parsedTunnel.port;

        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.set("X-Forwarded-Host", requestUrl.host);
        forwardHeaders.set("X-Forwarded-Proto", "https");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for large 4K chunks

        const tunnelRes = await fetch(tunnelTargetUrl.toString(), {
          method: request.method,
          headers: forwardHeaders,
          redirect: "follow",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (tunnelRes.ok || tunnelRes.status === 206) {
          const resHeaders = new Headers(tunnelRes.headers);
          resHeaders.set("Access-Control-Allow-Origin", "*");
          resHeaders.set("Access-Control-Allow-Headers", "*");
          resHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
          return new Response(tunnelRes.body, {
            status: tunnelRes.status,
            headers: resHeaders,
          });
        }
      } catch (err) {
        console.warn("[Worker] Tunnel forward attempt failed:", err);
      }
    }

    // Path 2: Direct edge fetch fallback for open CDNs (Zero Vercel)
    const target = isHttpsUrl(rawTarget);
    if (!target) {
      return jsonResponse({ error: "invalid target url" }, 400);
    }

    const isHakuna = target.hostname.toLowerCase().includes("hakunaymatata");
    const { referer, origin } = refererFor(requestUrl.searchParams.get("referer"));
    const range = request.headers.get("Range");

    const upstreamHeaders = new Headers();
    if (isHakuna) {
      upstreamHeaders.set("User-Agent", "ExoPlayer/1.5.1 (Linux; Android TV)");
    } else {
      upstreamHeaders.set(
        "User-Agent",
        request.headers.get("User-Agent") ||
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      );
      if (referer) upstreamHeaders.set("Referer", referer);
      if (origin) upstreamHeaders.set("Origin", origin);
    }
    if (range) upstreamHeaders.set("Range", range);

    try {
      const upstream = await fetch(target.href, {
        method: request.method,
        headers: upstreamHeaders,
        redirect: "follow",
      });

      if (!upstream.ok && upstream.status !== 206) {
        return jsonResponse(
          { error: `edge upstream error ${upstream.status}`, statusText: upstream.statusText },
          upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
        );
      }

      const contentType = upstream.headers.get("content-type") || "";
      const path = target.pathname.toLowerCase();
      const looksPlaylist =
        contentType.includes("mpegurl") ||
        contentType.includes("m3u8") ||
        path.endsWith(".m3u8");
      const looksVtt = contentType.includes("vtt") || path.endsWith(".vtt");
      const relayBase = `${requestUrl.protocol}//${requestUrl.host}`;

      // 1. Playlists (.m3u8): enrich audio and rewrite child URLs to Cloudflare Worker relay
      if (looksPlaylist) {
        const text = await upstream.text();
        const rewritten = rewritePlaylist(text, target.href, relayBase, referer);
        return new Response(rewritten, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
            "Cache-Control": "no-cache",
            ...CORS_HEADERS,
          },
        });
      }

      // 2. Subtitles (.vtt / .srt)
      if (looksVtt || path.endsWith(".srt")) {
        const rawSub = await upstream.text();
        const body = isSrtText(rawSub) ? srtToVtt(rawSub) : rawSub;
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/vtt; charset=utf-8",
            "Cache-Control": "public, max-age=300",
            ...CORS_HEADERS,
          },
        });
      }

      const resHeaders = new Headers(upstream.headers);
      resHeaders.set("Access-Control-Allow-Origin", "*");
      resHeaders.set("Access-Control-Allow-Headers", "*");
      resHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

      return new Response(upstream.body, {
        status: upstream.status,
        headers: resHeaders,
      });
    } catch (edgeErr) {
      return jsonResponse(
        { error: "edge relay failure", details: edgeErr.message },
        502
      );
    }
  },
};

export default worker;
