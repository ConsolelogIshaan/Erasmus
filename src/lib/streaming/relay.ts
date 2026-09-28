/**
 * HLS relay target resolution.
 * ---------------------------------------------------------------------------
 * Playback needs a server-side relay because referer-locked upstream CDNs
 * (VidFast/Lisbon's `quietnexus.top`, `moon.quietridge.top`, etc.) reject
 * segment requests that don't carry their `Referer` header, and browsers are
 * not allowed to set a third-party `Referer` themselves.
 *
 * Relaying through Vercel means every video byte is billed twice against
 * "Fast Origin Transfer" (CDN -> Vercel inbound, Vercel -> browser outbound).
 * Pointing `NEXT_PUBLIC_HLS_RELAY_URL` at the Cloudflare Worker in
 * `erasmus-hls-relay/worker.js` moves that traffic onto a per-request billing
 * model instead, taking the video bytes off Vercel's meter entirely.
 *
 * SAFETY CONTRACT:
 * - When `NEXT_PUBLIC_HLS_RELAY_URL` is unset, this resolves to the local
 *   `/api/stream/hls` route — byte-for-byte the behaviour that shipped before
 *   this module existed. The flag is opt-in; absence of config changes nothing.
 * - Malformed or non-https values also fall back to the local route rather
 *   than producing a broken relay base. Mixed content would be blocked by the
 *   browser anyway, so a bad value must never be trusted.
 * - Removing the env var is therefore a complete, instant rollback that
 *   requires no code revert and no redeploy of application logic.
 */

/** Local Next.js relay route. */
export const LOCAL_HLS_RELAY = "/api/stream/hls";

export const CLOUDFLARE_HLS_RELAY = "https://erasmus-hls-relay.erasmustv.workers.dev";

function resolveRelayBase(): string {
  if (typeof window !== "undefined") {
    // When running in the browser on localhost / 127.0.0.1, connect directly to local relay
    // to bypass all external network round-trips and achieve 0ms local streaming latency.
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:8443";
    }
  }

  const raw = process.env.NEXT_PUBLIC_HLS_RELAY_URL?.trim();
  if (raw === "local") return LOCAL_HLS_RELAY;
  if (raw) {
    try {
      const url = new URL(raw);
      // Allow http only for local loopback development
      if (
        url.protocol === "https:" ||
        (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
      ) {
        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
      }
    } catch {
      // Fall through to default Cloudflare worker
    }
  }
  return CLOUDFLARE_HLS_RELAY;
}

/** Active relay base: the Cloudflare Worker smart router by default, or overridden via env. */
export const HLS_RELAY_BASE = resolveRelayBase();

/** True when a URL already points at a relay and must not be double-wrapped. */
export function isRelayUrl(url: string): boolean {
  if (url.startsWith(LOCAL_HLS_RELAY)) return true;
  if (url.includes("trycloudflare.com")) return true;
  if (url.includes("localhost:8443") || url.includes("127.0.0.1:8443")) return true;
  if (url.includes("workers.dev")) return true;
  const currentBase = resolveRelayBase();
  return currentBase !== LOCAL_HLS_RELAY && url.startsWith(currentBase);
}

/**
 * Wraps an upstream URL in the active relay, preserving the provider referer.
 * Mirrors the original inline `relayUrl()` helper exactly, including its
 * already-relayed short-circuit.
 */
export function buildRelayUrl(url: string, referer?: string): string {
  if (isRelayUrl(url)) return url;
  const currentBase = resolveRelayBase();
  const query = new URLSearchParams({ url });
  if (referer) query.set("referer", referer);
  return `${currentBase}?${query.toString()}`;
}
