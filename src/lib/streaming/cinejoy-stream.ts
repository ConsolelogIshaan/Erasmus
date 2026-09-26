import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}

if (typeof process !== "undefined" && process.env) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { STREAMING_SERVERS } from "@/lib/streaming/stream-resolver";
import { getMediaProvider } from "@/lib/media/providers";
import {
  getAlternateTvCoordinates,
  resolveVidfastDirectStream,
} from "@/lib/streaming/vidfast-direct";

const ENC_API = "https://enc-dec.app/api";
const SHEGU = "https://api.shegu.st";
export const CINEJOY_REFERER = "https://cinejoy.to/";

const LANG_DISPLAY: Record<string, string> = {
  en: "English",
  eng: "English",
  zh: "Chinese",
  chi: "Chinese",
  zho: "Chinese",
  zht: "Chinese (Traditional)",
  id: "Indonesian",
  ind: "Indonesian",
  ms: "Malay",
  may: "Malay",
  th: "Thai",
  tha: "Thai",
  vi: "Vietnamese",
  vie: "Vietnamese",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  ar: "Arabic",
  ara: "Arabic",
  es: "Spanish",
  spa: "Spanish",
  fr: "French",
  fre: "French",
  fra: "French",
  de: "German",
  ger: "German",
  deu: "German",
  it: "Italian",
  ita: "Italian",
  pt: "Portuguese",
  por: "Portuguese",
  ru: "Russian",
  rus: "Russian",
  hi: "Hindi",
  hin: "Hindi",
  tr: "Turkish",
  tur: "Turkish",
};

export function formatCaptionLabel(label: string, language: string, url: string): string {
  const urlLower = url.toLowerCase();
  const langKey = (language || label).toLowerCase();
  const name = LANG_DISPLAY[langKey] || label || language;
  if (langKey.startsWith("zh") || name === "Chinese") {
    if (urlLower.includes("traditional") || langKey === "zht") return "Chinese (Traditional)";
    if (urlLower.includes("simplified") || langKey === "zhs") return "Chinese (Simplified)";
  }
  if (langKey.startsWith("pt") && (urlLower.includes("br") || langKey.includes("br"))) {
    return "Portuguese (BR)";
  }
  return name;
}

const SHEGU_HEADERS = {
  Accept: "*/*",
  Origin: "https://cinejoy.to",
  Referer: CINEJOY_REFERER,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
};

export interface CinejoyCaption {
  label: string;
  language: string;
  url: string;
}

export interface CinejoyStreamHit {
  url: string;
  kind: "hls" | "file";
  referer: string;
  captions: CinejoyCaption[];
  serverName: string;
  is4K?: boolean;
  hdUrl?: string;
  fourKUrl?: string;
  isDirectCors?: boolean;
}

function b64urlDecode(data: string): Buffer {
  const pad = "=".repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function sheguServerName(serverId: string): string {
  return (
    STREAMING_SERVERS.find((server) => server.id === serverId)?.name || "Lisbon"
  );
}

export function buildSheguQuery(input: {
  title: string;
  type: "movie" | "tv";
  year?: string;
  imdbId?: string;
  tmdbId: string;
  serverName: string;
  season?: number;
  episode?: number;
}): string {
  const params = new URLSearchParams({
    title: input.title,
    type: input.type === "tv" ? "series" : "movie",
    tmdb: input.tmdbId,
    server: input.serverName,
  });
  if (input.year) params.set("year", input.year);
  if (input.imdbId) params.set("imdb", input.imdbId);
  if (input.type === "tv") {
    params.set("season", String(input.season ?? 1));
    params.set("episode", String(input.episode ?? 1));
  }
  return `${SHEGU}/?${params.toString()}`;
}

async function catalogMeta(type: "movie" | "tv", tmdbId: string) {
  try {
    const provider = getMediaProvider();
    if (type === "movie") {
      const movie = await provider.getMovie(tmdbId);
      if (!movie) return null;
      return {
        title: movie.title,
        year: movie.releaseDate?.slice(0, 4) || "",
        imdbId: movie.imdbId || "",
      };
    }
    const show = await provider.getTvShow(tmdbId);
    if (!show) return null;
    const isAnime = Boolean(
      show.genres?.some((g) => g.name === "Animation" || g.id === "16") &&
      (show.spokenLanguages?.some((l) => l.code === "ja" || l.name?.toLowerCase() === "japanese") ||
       show.productionCountries?.some((c) => c.code === "JP" || c.name?.toLowerCase() === "japan") ||
       show.keywords?.some((k) => k.name?.toLowerCase().includes("anime")))
    );
    return {
      title: show.title,
      year: (show.firstAirDate || show.releaseDate || "").slice(0, 4),
      imdbId: show.imdbId || "",
      isAnime,
    };
  } catch {
    return null;
  }
}

function pickStream(decoded: unknown): {
  url: string;
  kind: "hls" | "file";
  captions: CinejoyCaption[];
} | null {
  const root = decoded as {
    data?: {
      stream?: Array<{
        type?: string;
        playlist?: string;
        url?: string;
        file?: string;
        captions?: Array<{ label?: string; language?: string; file?: string; url?: string }>;
      }>;
    };
    stream?: Array<{ playlist?: string; url?: string }>;
  };
  const streams = (root?.data?.stream || root?.stream || []) as Array<{
    playlist?: string;
    url?: string;
    file?: string;
    captions?: Array<{ label?: string; language?: string; file?: string; url?: string }>;
  }>;
  const hit = streams.find((item) => item.playlist || item.url || item.file);
  const url = hit?.playlist || hit?.url || hit?.file;
  if (!url) return null;
  const captions = (hit?.captions || [])
    .map((caption) => {
      const url = caption.file || caption.url || "";
      const language = caption.language || caption.label || "und";
      const label = formatCaptionLabel(caption.label || "", language, url);
      return {
        label,
        language,
        url,
      };
    })
    .filter((caption) => caption.url);
  return {
    url,
    kind: /\.mp4(\?|$)/i.test(url) ? "file" : "hls",
    captions,
  };
}

export async function resolveCinejoyServer(input: {
  type: "movie" | "tv";
  tmdbId: string;
  title?: string;
  year?: string;
  imdbId?: string;
  season?: number;
  episode?: number;
  serverId?: string;
}): Promise<CinejoyStreamHit | null> {
  const meta = await catalogMeta(input.type, input.tmdbId);
  const title = meta?.title || input.title;
  if (!title) return null;
  const serverName = sheguServerName(input.serverId || "lisbon");

  const trySheguFetch = async (queryTitle: string, queryYear?: string): Promise<CinejoyStreamHit | null> => {
    const queryUrl = buildSheguQuery({
      title: queryTitle,
      type: input.type,
      year: queryYear,
      imdbId: meta?.imdbId || input.imdbId,
      tmdbId: input.tmdbId,
      serverName,
      season: input.season,
      episode: input.episode,
    });

    try {
      const encRes = await fetch(
        `${ENC_API}/enc-cinejoy?url=${encodeURIComponent(queryUrl)}`,
        { signal: AbortSignal.timeout(3000) }
      );
      const encJson = (await encRes.json()) as {
        status?: number;
        result?: { data?: string; state?: unknown };
      };
      if (encJson.status !== 200 || !encJson.result?.data || !encJson.result.state) {
        return null;
      }

      const packed = await fetch(`${SHEGU}/g`, {
        method: "POST",
        headers: SHEGU_HEADERS,
        body: new Uint8Array(b64urlDecode(encJson.result.data)),
        signal: AbortSignal.timeout(3000),
      });
      if (!packed.ok) return null;
      const packedBuf = Buffer.from(await packed.arrayBuffer());

      const decRes = await fetch(`${ENC_API}/dec-cinejoy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: b64urlEncode(packedBuf),
          state: encJson.result.state,
        }),
        signal: AbortSignal.timeout(3000),
      });
      const decJson = (await decRes.json()) as { status?: number; result?: unknown };
      if (decJson.status !== 200) return null;
      const stream = pickStream(decJson.result);
      if (!stream) return null;
      return {
        ...stream,
        referer: CINEJOY_REFERER,
        serverName,
      };
    } catch {
      return null;
    }
  };

  // 1. Primary lookup
  const hit = await trySheguFetch(title, meta?.year || input.year);
  if (hit) return hit;

  // 2. Fallback for titles with colons/dashes (e.g. subtitles like "Dune: Part Two" -> "Dune")
  if (title.includes(":") || title.includes(" - ")) {
    const mainTitle = title.split(/[:\-]/)[0]?.trim();
    if (mainTitle && mainTitle !== title) {
      const subHit = await trySheguFetch(mainTitle, meta?.year || input.year);
      if (subHit) return subHit;
    }
  }

  // 3. Fallback without year restriction for movies
  if (meta?.year || input.year) {
    const noYearHit = await trySheguFetch(title, undefined);
    if (noYearHit) return noYearHit;
  }

  return null;
}

export async function resolveCinejoyStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  title?: string;
  year?: string;
  imdbId?: string;
  season?: number;
  episode?: number;
  serverId?: string;
  isFallback?: boolean;
}): Promise<CinejoyStreamHit | null> {
  const preferred = input.serverId || "lisbon";
  const order = [
    preferred,
    ...STREAMING_SERVERS.map((server) => server.id).filter((id) => id !== preferred),
  ];

  // Try preferred server first
  try {
    const hit = await resolveCinejoyServer({ ...input, serverId: preferred });
    if (hit && !hit.url.includes("lol.movieboxnoob.cc")) {
      return hit;
    }
  } catch {
    // Shegu down or timed out
  }

  // Try remaining servers (up to 2 more)
  for (const serverId of order.slice(1, 3)) {
    try {
      const hit = await resolveCinejoyServer({ ...input, serverId });
      if (hit && !hit.url.includes("lol.movieboxnoob.cc")) {
        return hit;
      }
    } catch {
      break;
    }
  }

  // If TV and primary coordinates produced no stream, evaluate smart alternate cour/season coordinates
  if (input.type === "tv" && !input.isFallback) {
    const alternates = getAlternateTvCoordinates(input.season ?? 1, input.episode ?? 1);
    for (const alt of alternates.slice(0, 3)) {
      try {
        const altHit = await resolveCinejoyStream({
          ...input,
          season: alt.season,
          episode: alt.episode,
          isFallback: true,
        });
        if (altHit && !altHit.url.includes("lol.movieboxnoob.cc")) {
          return altHit;
        }
      } catch {}
    }
  }

  return null;
}

export async function resolveVidlinkStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverName?: string;
}): Promise<CinejoyStreamHit | null> {
  try {
    const encRes = await fetch(`${ENC_API}/enc-vidlink?text=${encodeURIComponent(input.tmdbId)}`, {
      headers: { "User-Agent": SHEGU_HEADERS["User-Agent"] },
      signal: AbortSignal.timeout(3500),
    });
    if (!encRes.ok) return null;
    const encJson = (await encRes.json()) as { status?: number; result?: string };
    if (encJson.status !== 200 || !encJson.result) return null;

    const encKey = encJson.result;
    const isTv = input.type === "tv";
    const s = input.season ?? 1;
    const e = input.episode ?? 1;
    const apiUrl = isTv
      ? `https://vidlink.pro/api/b/tv/${encKey}/${s}/${e}`
      : `https://vidlink.pro/api/b/movie/${encKey}`;

    const vidRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": SHEGU_HEADERS["User-Agent"],
        Origin: "https://vidlink.pro",
        Referer: "https://vidlink.pro/",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!vidRes.ok) return null;
    const vidJson = (await vidRes.json()) as {
      stream?: {
        playlist?: string;
        qualities?: Record<string, { url?: string; type?: string; codecName?: string }>;
        captions?: Array<{ url?: string; file?: string; language?: string; label?: string }>;
      };
      tracks?: Array<{ url?: string; file?: string; language?: string; label?: string }>;
      captions?: Array<{ url?: string; file?: string; language?: string; label?: string }>;
    };

    const streamObj = vidJson.stream;
    if (!streamObj) return null;

    const q = streamObj.qualities;
    // Vidlink provides HLS playlists or direct MP4 streams (e.g. pristine 1080p from Hakuna Matata CDN)
    let webPlayableUrl: string | undefined = streamObj.playlist;
    let isWebHls = Boolean(streamObj.playlist);

    if (!webPlayableUrl && q) {
      const candidateTiers = ["2160", "1080", "720", "480", "360"];
      for (const tier of candidateTiers) {
        const item = q[tier];
        if (item?.url) {
          webPlayableUrl = item.url;
          isWebHls = item.url.includes(".m3u8");
          break;
        }
      }
    }

    if (!webPlayableUrl) {
      return null;
    }

    const streamUrl = webPlayableUrl;

    const rawCaptions = streamObj.captions || vidJson.tracks || vidJson.captions || [];
    const captions: CinejoyCaption[] = rawCaptions
      .map((c) => {
        const url = c.url || c.file || "";
        const language = c.language || c.label || "en";
        const label = formatCaptionLabel(c.label || language, language, url);
        return { label, language, url };
      })
      .filter((c) => Boolean(c.url));

    const is4K = Boolean(q?.["2160"]);
    const isFile = !isWebHls && streamUrl.includes(".mp4");
    const isHakuna = streamUrl.toLowerCase().includes("hakunaymatata");

    return {
      url: streamUrl,
      kind: isFile ? "file" : "hls",
      referer: isHakuna ? "" : "https://vidlink.pro/",
      captions,
      serverName: input.serverName || "Nebula (Cinejoy Edge)",
      is4K,
      hdUrl: q?.["1080"]?.url || q?.["720"]?.url || streamUrl,
      fourKUrl: q?.["2160"]?.url,
      isDirectCors: false,
    };
  } catch {
    return null;
  }
}

export async function resolveVidloveStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverName?: string;
  source?: string;
}): Promise<CinejoyStreamHit | null> {
  try {
    const isTv = input.type === "tv";
    const s = input.season ?? 1;
    const e = input.episode ?? 1;
    const base = isTv
      ? `https://api.vidlove.cc/tv?id=${encodeURIComponent(input.tmdbId)}&season=${s}&episode=${e}&mode=json`
      : `https://api.vidlove.cc/movie?id=${encodeURIComponent(input.tmdbId)}&mode=json`;
    const url = input.source ? `${base}&sources=${encodeURIComponent(input.source)}` : base;

    const res = await fetch(url, {
      headers: {
        "User-Agent": SHEGU_HEADERS["User-Agent"],
        Referer: "https://player.vidlove.cc/",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      source?: { url?: string; label?: string };
      subtitles?: Array<{ file?: string; url?: string; label?: string; language?: string }>;
    };

    const streamUrl = json.source?.url;
    if (!streamUrl) return null;

    // Filter out known 3rd-party scrapers that burn betting watermarks into video frames (e.g. 4RABET / whysosigmabro)
    if (streamUrl.includes("whysosigmabro.cfd")) {
      return null;
    }

    const captions: CinejoyCaption[] = (json.subtitles || [])
      .map((s) => {
        const u = s.file || s.url || "";
        const lang = s.language || s.label || "und";
        const label = formatCaptionLabel(s.label || lang, lang, u);
        return { label, language: lang, url: u };
      })
      .filter((c) => Boolean(c.url));

    return {
      url: streamUrl,
      kind: streamUrl.includes(".mp4") ? "file" : "hls",
      referer: "https://player.vidlove.cc/",
      captions,
      serverName: input.serverName || "Cinejoy Cloud",
      is4K: false,
      isDirectCors: false,
    };
  } catch {
    return null;
  }
}

export async function resolveCinejoyClusterStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  serverId: string;
  season?: number;
  episode?: number;
  title?: string;
  year?: string;
  imdbId?: string;
  isFallback?: boolean;
}): Promise<CinejoyStreamHit | null> {
  const normId = input.serverId.toLowerCase();

  switch (normId) {
    case "cj-nebula": {
      // 1. Vidlink pristine edge stream (Hakuna Matata 1080p clean master - same as TV app)
      const vidlinkHit = await resolveVidlinkStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Nebula (Cinejoy Edge)",
      });
      if (vidlinkHit) return vidlinkHit;

      // 2. Vidlove edge CDN fallback
      const vidloveHit = await resolveVidloveStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Nebula (Cinejoy Edge)",
      });
      if (vidloveHit) return vidloveHit;

      // 3. Vidfast fallback
      const vfRes = await resolveVidfastDirectStream({ ...input, serverId: "nebula" });
      if (vfRes.hit?.url) {
        return {
          url: vfRes.hit.url,
          kind: vfRes.hit.kind,
          referer: vfRes.hit.referer,
          captions: [],
          serverName: "Nebula (Cinejoy 4K)",
          is4K: vfRes.hit.is4K,
          hdUrl: vfRes.hit.hdUrl,
          fourKUrl: vfRes.hit.fourKUrl,
          isDirectCors: false,
        };
      }
      break;
    }

    case "cj-lisbon": {
      // 1. Flagship 4K Master HLS ladder (Vidfast vRapid/vBlaze)
      const vfRes = await resolveVidfastDirectStream({ ...input, serverId: "lisbon" });
      if (vfRes.hit?.url) {
        return {
          url: vfRes.hit.url,
          kind: vfRes.hit.kind,
          referer: vfRes.hit.referer,
          captions: [],
          serverName: "Lisbon (Cinejoy 4K)",
          is4K: vfRes.hit.is4K,
          hdUrl: vfRes.hit.hdUrl,
          fourKUrl: vfRes.hit.fourKUrl,
          isDirectCors: false,
        };
      }

      // 2. Vidlove cloud fallback
      const vidloveHit = await resolveVidloveStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Lisbon (Cinejoy Cloud)",
      });
      if (vidloveHit) return vidloveHit;

      // 3. Vidlink mirror fallback
      const vidlinkHit = await resolveVidlinkStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Lisbon (Cinejoy Mirror)",
      });
      if (vidlinkHit) return vidlinkHit;
      break;
    }

    case "cj-athens": {
      // 1. 4K UHD Direct rip (Vidfast vFast)
      const vfRes = await resolveVidfastDirectStream({ ...input, serverId: "athens" });
      if (vfRes.hit?.url) {
        return {
          url: vfRes.hit.url,
          kind: vfRes.hit.kind,
          referer: vfRes.hit.referer,
          captions: [],
          serverName: "Athens (Cinejoy 4K)",
          is4K: vfRes.hit.is4K,
          hdUrl: vfRes.hit.hdUrl,
          fourKUrl: vfRes.hit.fourKUrl,
          isDirectCors: false,
        };
      }

      // 2. Vidlove cloud fallback
      const vidloveHit = await resolveVidloveStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Athens (Cinejoy Cloud)",
      });
      if (vidloveHit) return vidloveHit;

      // 3. Vidlink mirror fallback
      const vidlinkHit = await resolveVidlinkStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Athens (Cinejoy Mirror)",
      });
      if (vidlinkHit) return vidlinkHit;
      break;
    }

    case "cj-shegu":
    default: {
      // 1. Encrypted Shegu binary gateway (api.shegu.st/g)
      try {
        const sheguHit = await resolveCinejoyServer({ ...input, serverId: "lisbon" });
        if (sheguHit && !sheguHit.url.includes("lol.movieboxnoob.cc")) {
          return {
            ...sheguHit,
            serverName: "Shegu (Cinejoy Core)",
          };
        }
      } catch {}

      // 2. Vidlove edge cloud fallback
      const vidloveHit = await resolveVidloveStream({
        type: input.type,
        tmdbId: input.tmdbId,
        season: input.season,
        episode: input.episode,
        serverName: "Shegu (Cinejoy Cloud)",
      });
      if (vidloveHit) return vidloveHit;

      // 3. Vidfast fallback
      const vfRes = await resolveVidfastDirectStream({ ...input, serverId: "lisbon" });
      if (vfRes.hit?.url) {
        return {
          url: vfRes.hit.url,
          kind: vfRes.hit.kind,
          referer: vfRes.hit.referer,
          captions: [],
          serverName: "Shegu (Cinejoy 4K)",
          is4K: vfRes.hit.is4K,
          hdUrl: vfRes.hit.hdUrl,
          fourKUrl: vfRes.hit.fourKUrl,
          isDirectCors: false,
        };
      }
      break;
    }
  }

  // Smart alternate cour fallback for TV
  if (input.type === "tv" && !input.isFallback) {
    const alternates = getAlternateTvCoordinates(input.season ?? 1, input.episode ?? 1);
    for (const alt of alternates.slice(0, 3)) {
      try {
        const altHit = await resolveCinejoyClusterStream({
          ...input,
          season: alt.season,
          episode: alt.episode,
          isFallback: true,
        });
        if (altHit && !altHit.url.includes("lol.movieboxnoob.cc")) {
          return altHit;
        }
      } catch {}
    }
  }

  return null;
}
