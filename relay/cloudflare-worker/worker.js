/**
 * Erasmus HLS Relay — Dynamic Smart Router & Cloudflare Worker
 * ============================================================
 *
 * Architecture:
 * 1. Client plays video -> requests stream from `https://erasmus-hls-relay.erasmustv.workers.dev`
 * 2. If user's residential PC tunnel is active (via Cloudflare Quick Tunnel),
 *    Worker transparently proxies request through the tunnel to user's PC.
 *    User's PC fetches video segments from VidFast over Reliance Jio residential IP (never blocked).
 *    Result: 0 bytes on Vercel, $0 cost, unlimited bandwidth.
 * 3. If user's PC is sleeping/offline or tunnel times out:
 *    Worker automatically falls back to Vercel (`/api/stream/hls`), guaranteeing playback NEVER halts.
 * 4. Zero Supabase queries, zero schema changes, zero database egress.
 */

const SYNC_SECRET = "erasmus_relay_tunnel_key_9247f1";
const HEARTBEAT_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const VERCEL_FALLBACK_BASE = "https://erasmus-nine.vercel.app/api/stream/hls";

// In-memory cache for ultra-fast (0ms) routing without KV read latency on every chunk
let cachedTarget = null;
let cachedPing = 0;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
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
        service: "Erasmus HLS Smart Relay",
        activeTunnel: target || "none",
        isTunnelAlive: isAlive,
        secondsSincePing: Math.round((now - cachedPing) / 1000),
        fallbackUrl: VERCEL_FALLBACK_BASE,
      });
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
        const timeoutId = setTimeout(() => controller.abort(), 7000); // 7s timeout

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
          return new Response(tunnelRes.body, {
            status: tunnelRes.status,
            headers: resHeaders,
          });
        }
      } catch (err) {
        console.warn("[Worker] Tunnel forward attempt failed, failing over to Vercel fallback:", err);
      }
    }

    // Path 2: Safe Fallback to Vercel (Guarantees uninterrupted playback if PC is off)
    try {
      const fallbackUrl = `${VERCEL_FALLBACK_BASE}${requestUrl.search}`;
      const forwardHeaders = new Headers(request.headers);
      forwardHeaders.set("X-Forwarded-Host", requestUrl.host);

      const fallbackRes = await fetch(fallbackUrl, {
        method: request.method,
        headers: forwardHeaders,
        redirect: "follow",
      });

      const resHeaders = new Headers(fallbackRes.headers);
      resHeaders.set("Access-Control-Allow-Origin", "*");
      return new Response(fallbackRes.body, {
        status: fallbackRes.status,
        headers: resHeaders,
      });
    } catch (fallbackErr) {
      return jsonResponse(
        { error: "relay failure", details: fallbackErr.message },
        502
      );
    }
  },
};

export default worker;

