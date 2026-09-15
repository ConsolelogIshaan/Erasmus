import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}
import { STREAMING_SERVERS } from "@/lib/streaming/stream-resolver";
import { getMediaProvider } from "@/lib/media/providers";

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
  let name = LANG_DISPLAY[langKey] || label || language;
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
  const queryUrl = buildSheguQuery({
    title,
    type: input.type,
    year: meta?.year || input.year,
    imdbId: meta?.imdbId || input.imdbId,
    tmdbId: input.tmdbId,
    serverName,
    season: input.season,
    episode: input.episode,
  });

  const encRes = await fetch(
    `${ENC_API}/enc-cinejoy?url=${encodeURIComponent(queryUrl)}`,
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
}): Promise<CinejoyStreamHit | null> {
  const preferred = input.serverId || "lisbon";
  const order = [
    preferred,
    ...STREAMING_SERVERS.map((server) => server.id).filter((id) => id !== preferred),
  ];

  // 1. Try preferred server with requested episode
  try {
    const hit = await resolveCinejoyServer({ ...input, serverId: preferred });
    if (hit && !hit.url.includes("lol.movieboxnoob.cc")) {
      return hit;
    }
  } catch {}

  // 2. Try remaining servers
  for (const serverId of order.slice(1)) {
    try {
      const hit = await resolveCinejoyServer({ ...input, serverId });
      if (hit && !hit.url.includes("lol.movieboxnoob.cc")) {
        return hit;
      }
    } catch {}
  }

  return null;
}
