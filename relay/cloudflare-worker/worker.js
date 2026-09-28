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
const HEARTBEAT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes for rock-solid tunnel stability without KV replication jitter
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

const DEFAULT_TUNNEL_URL = "https://nurse-autumn-browser-rpg.trycloudflare.com";

async function getActiveTunnel(env) {
  if (cachedTarget) return cachedTarget;

  if (env && env.RELAY_CONFIG) {
    try {
      const target = await env.RELAY_CONFIG.get("TARGET_URL");
      if (target && (target.startsWith("http://") || target.startsWith("https://"))) {
        cachedTarget = target;
        return target;
      }
    } catch (err) {
      console.warn("[Worker] KV read error:", err);
    }
  }

  return env?.TUNNEL_URL || DEFAULT_TUNNEL_URL;
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
          try {
            await Promise.all([
              env.RELAY_CONFIG.put("TARGET_URL", target),
              env.RELAY_CONFIG.put("LAST_PING", now.toString()),
            ]);
          } catch (kvErr) {
            console.warn("[Worker] KV put error:", kvErr);
          }
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
      return jsonResponse({ status: "ok", ping: now, target: cachedTarget });
    }

    // --- ENDPOINT: /status or /health ---
    if (pathname === "/status" || pathname === "/health") {
      const now = Date.now();
      const target = await getActiveTunnel(env);

      return jsonResponse({
        status: "ok",
        service: "Erasmus HLS Dynamic Smart Relay",
        activeTunnel: target || "none",
        isTunnelAlive: Boolean(target),
        secondsSincePing: cachedPing ? Math.round((now - cachedPing) / 1000) : 0,
        vercelFree: true,
      });
    }

    // --- ENDPOINT: /tunnel-url ---
    if (pathname === "/tunnel-url") {
      const target = await getActiveTunnel(env);
      return jsonResponse({ ok: Boolean(target), tunnelUrl: target || null, isAlive: Boolean(target) });
    }

    // --- ENDPOINT: /api/stream/direct or /resolve-direct ---
    if (pathname === "/api/stream/direct" || pathname === "/resolve-direct") {
      const target = await getActiveTunnel(env);
      if (target) {
        try {
          const directTargetUrl = `${target}${pathname}${requestUrl.search}`;
          const dRes = await fetch(directTargetUrl, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(12000),
          });
          if (dRes.ok) {
            const dData = await dRes.text();
            return new Response(dData, {
              status: dRes.status,
              headers: {
                "Content-Type": "application/json",
                ...CORS_HEADERS,
              },
            });
          }
        } catch (dErr) {
          console.warn("[Worker] Direct resolver tunnel attempt failed:", dErr.message);
        }
      }
      return jsonResponse({ ok: false, error: "residential bridge offline" }, 503);
    }

    // --- STREAMING VIDEO RELAY LOGIC ---
    const rawTarget = requestUrl.searchParams.get("url");
    if (!rawTarget) {
      return jsonResponse({ error: "missing url query parameter" }, 400);
    }

    const target = isHttpsUrl(rawTarget);
    if (!target) {
      return jsonResponse({ error: "invalid target url" }, 400);
    }

    const activeTunnel = await getActiveTunnel(env);

    const { referer, origin } = refererFor(requestUrl.searchParams.get("referer"));
    const targetHost = target.hostname.toLowerCase();
    // Referer-locked VidFast streams and residential-restricted Hakuna Matata streams route through residential tunnel when available:
    const isVidfastStream =
      targetHost.endsWith(".top") ||
      targetHost.includes("vidfast") ||
      targetHost.includes("hakunaymatata") ||
      Boolean(referer && referer.includes("vidfast"));

    // Path 1: Forward VidFast streams to local residential PC tunnel (Zero-Vercel mode)
    if (activeTunnel && isVidfastStream) {
      try {
        const tunnelTargetUrl = new URL(request.url);
        const parsedTunnel = new URL(activeTunnel);
        tunnelTargetUrl.protocol = parsedTunnel.protocol;
        tunnelTargetUrl.host = parsedTunnel.host;
        tunnelTargetUrl.port = parsedTunnel.port;

        const forwardHeaders = new Headers(request.headers);
        forwardHeaders.set("X-Forwarded-Host", requestUrl.host);
        forwardHeaders.set("X-Forwarded-Proto", "https");

        const isPlaylist = target.pathname.toLowerCase().endsWith(".m3u8") || rawTarget.includes(".m3u8");
        const timeoutMs = isPlaylist ? 6000 : 18000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
          const ct = (resHeaders.get("content-type") || "").toLowerCase();
          if (ct.startsWith("image/") || rawTarget.includes(".jpg") || rawTarget.includes(".png") || rawTarget.includes(".ts")) {
            resHeaders.set("Content-Type", "video/mp2t");
          }
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

    const isHakuna = target.hostname.toLowerCase().includes("hakunaymatata");
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

      // Normalize disguised video segments:
      // Scrapers & CDNs (Bastion, Bxcnm, Tlnob) disguise MPEG-TS chunks as .jpg/.png images with Content-Type: image/jpeg.
      // Browsers and MSE (MediaSource) cannot append image/jpeg to video SourceBuffers and hang in perpetual loading.
      if (
        contentType.startsWith("image/") ||
        path.endsWith(".jpg") ||
        path.endsWith(".png") ||
        path.endsWith(".ts")
      ) {
        resHeaders.set("Content-Type", "video/mp2t");
      }

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
