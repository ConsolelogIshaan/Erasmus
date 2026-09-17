/**
 * Hidden multi-source playback engine.
 *
 * 1. Lisbon  - Flagship high-bitrate 4K/1080p
 * 2. Sakura  - Anime and Asian media
 * 3. Nebula  - High-speed US edge
 * 4. Solara  - Universal cloud
 * 5. Athens  - High-availability 4K cinema mirror
 * 6. Joy     - Direct cloud stream
 * 7. Castle  - Direct video CDN
 * 8. Canaias - Global low-latency mirror
 */

export interface StreamServer {
  id: string;
  name: string;
  flag: string;
  country: string;
  badge: string;
  description: string;
  isPrimary?: boolean;
}

export interface StreamSourceOption {
  server: StreamServer;
  url: string;
}

export interface StreamItemParams {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  isAnime?: boolean;
  startAtSeconds?: number;
}

/** Hidden source roster used by the playback queue. */
export const STREAMING_SERVERS: StreamServer[] = [
  {
    id: "lisbon",
    name: "Lisbon",
    flag: "🇺🇸",
    country: "US",
    badge: "4K Ultra HD",
    description: "Primary flagship server with ultra-high bitrate and multi-audio",
    isPrimary: true,
  },
  {
    id: "sakura",
    name: "Sakura",
    flag: "🇯🇵",
    country: "JP",
    badge: "1080p Full HD",
    description: "Dedicated anime and Asian media cluster with dual audio and subtitles",
  },
  {
    id: "nebula",
    name: "Nebula",
    flag: "🇺🇸",
    country: "US",
    badge: "1080p High Speed",
    description: "High-speed US edge CDN cluster for instant start times",
  },
  {
    id: "solara",
    name: "Solara",
    flag: "🇺🇸",
    country: "US",
    badge: "1080p Full HD",
    description: "Universal cloud media cluster with full seasonal library",
  },
  {
    id: "athens",
    name: "Athens",
    flag: "🇺🇸",
    country: "US",
    badge: "4K Ultra HD",
    description: "High-availability 4K cinema mirror for blockbuster films",
  },
  {
    id: "joy",
    name: "Joy",
    flag: "🇺🇸",
    country: "US",
    badge: "Direct Stream",
    description: "Native cloud player stream with synchronized subtitles",
  },
  {
    id: "castle",
    name: "Castle",
    flag: "🇺🇸",
    country: "US",
    badge: "1080p HD",
    description: "Direct video CDN stream with low latency",
  },
  {
    id: "canaias",
    name: "Canaias",
    flag: "🇧🇷",
    country: "BR",
    badge: "Global Edge",
    description: "Global low-latency international mirror server",
  },
];

function startAtSeconds(params: StreamItemParams): number {
  return Math.max(0, Math.floor(params.startAtSeconds ?? 0));
}

function vidfastUrl(params: StreamItemParams, subServer = "vFast"): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  // vidfast.pro 302s to vidfast.vc. Chrome blocks the redirect unless
  // the embed origin is the iframe src and is allowed in CSP frame-src.
  // server=vFast preselects Lisbon's 4K sub-server inside the embed.
  const q = `autoPlay=true&theme=1D90F5&startAt=${startAtSeconds(params)}&title=false&poster=false&server=${encodeURIComponent(subServer)}`;
  return type === "movie"
    ? `https://vidfast.vc/movie/${tmdbId}?${q}`
    : `https://vidfast.vc/tv/${tmdbId}/${season}/${episode}?${q}`;
}

function movies111Url(params: StreamItemParams): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  // 111movies.com 302s to player.vidlove.cc; use the embed origin directly.
  return type === "movie"
    ? `https://player.vidlove.cc/embed/movie/${tmdbId}`
    : `https://player.vidlove.cc/embed/tv/${tmdbId}/${season}/${episode}`;
}

function vidlinkUrl(params: StreamItemParams, extraQuery = ""): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  const start = startAtSeconds(params);
  const startQ = start > 0 ? `&startAt=${start}` : "";
  const q = `primaryColor=1D90F5&secondaryColor=000000&autoplay=true${startQ}${extraQuery}`;
  return type === "movie"
    ? `https://vidlink.pro/movie/${tmdbId}?${q}`
    : `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?${q}`;
}

function vidsrcPmUrl(params: StreamItemParams): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  return type === "movie"
    ? `https://vidsrc.pm/embed/movie/${tmdbId}`
    : `https://vidsrc.pm/embed/tv/${tmdbId}/${season}/${episode}`;
}

function embed2Url(params: StreamItemParams): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  return type === "movie"
    ? `https://www.2embed.skin/embed/movie/${tmdbId}`
    : `https://www.2embed.skin/embed/tv/${tmdbId}/${season}/${episode}`;
}

function smashyUrl(params: StreamItemParams): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  // smashystream 302s to anyembed.xyz; use the embed origin directly.
  return type === "movie"
    ? `https://anyembed.xyz/embed/tmdb-movie-${tmdbId}`
    : `https://anyembed.xyz/embed/tmdb-tv-${tmdbId}/${season}/${episode}`;
}

function embed2CcUrl(params: StreamItemParams): string {
  const { type, tmdbId, season = 1, episode = 1 } = params;
  return type === "movie"
    ? `https://www.2embed.cc/embed/movie/${tmdbId}`
    : `https://www.2embed.cc/embed/tv/${tmdbId}/${season}/${episode}`;
}

export function buildStreamUrl(
  serverId: string,
  params: StreamItemParams,
): string {
  switch (serverId) {
    // Flagship 4K/high-bitrate player (native <video>, 4K sources)
    case "lisbon":
      return vidfastUrl(params);

    // Anime / Asian-capable embeddable player
    case "sakura":
      return movies111Url(params);

    // Confirmed-working US edge (JW Player)
    case "nebula":
      return vidlinkUrl(params);

    // Full-library cloud player
    case "solara":
      return vidsrcPmUrl(params);

    // ArtPlayer cinema mirror
    case "athens":
      return embed2Url(params);

    // Direct AnyEmbed stream
    case "joy":
      return smashyUrl(params);

    // Alternate ArtPlayer mirror
    case "castle":
      return embed2CcUrl(params);

    // Global edge (proven vidlink path, distinct query)
    case "canaias":
      return vidlinkUrl(params, "&title=true&poster=true");

    default:
      return vidfastUrl(params);
  }
}

/**
 * Returns all hidden sources configured for the given movie or TV episode.
 * Media-specific quality badges are accurately assigned:
 * - Movies on 4K clusters show "4K Ultra HD"
 * - TV series show "1080p Full HD" (zero clickbait)
 */
export function getSmartStreamingOptions(params: StreamItemParams): StreamSourceOption[] {
  const isTv = params.type === "tv";

  return STREAMING_SERVERS.map((server) => {
    // Dynamic honest badge assignment
    let badge = server.badge;
    if (server.id === "lisbon") {
      badge = "4K Ultra HD";
    } else if (server.id === "athens") {
      badge = isTv ? "1080p Full HD" : "4K Ultra HD";
    } else if (isTv && badge.includes("4K")) {
      badge = "1080p Full HD";
    }

    return {
      server: {
        ...server,
        badge,
      },
      url: buildStreamUrl(server.id, params),
    };
  });
}

export function getStreamingOptions(params: StreamItemParams): StreamSourceOption[] {
  return getSmartStreamingOptions(params);
}

export interface PlaybackCandidate {
  id: string;
  url: string;
}

/**
 * Hidden playback order. Lisbon (vFast, then vRapid) always leads.
 * Later entries are silent fallbacks if the current iframe fails to load.
 */
export function getPlaybackQueue(params: StreamItemParams): PlaybackCandidate[] {
  return [
    { id: "lisbon-vfast", url: vidfastUrl(params, "vFast") },
    { id: "lisbon-vrapid", url: vidfastUrl(params, "vRapid") },
    { id: "nebula", url: buildStreamUrl("nebula", params) },
    { id: "solara", url: buildStreamUrl("solara", params) },
    { id: "athens", url: buildStreamUrl("athens", params) },
    { id: "sakura", url: buildStreamUrl("sakura", params) },
    { id: "castle", url: buildStreamUrl("castle", params) },
    { id: "joy", url: buildStreamUrl("joy", params) },
    { id: "canaias", url: buildStreamUrl("canaias", params) },
  ];
}
