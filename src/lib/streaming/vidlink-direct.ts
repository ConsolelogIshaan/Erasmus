import type { CinejoyCaption, CinejoyStreamHit } from "./cinejoy-stream";

const ENC_API = "https://enc-dec.app/api";
const VIDLINK_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

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

export async function resolveVidlinkStream(input: {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
  serverName?: string;
}): Promise<CinejoyStreamHit | null> {
  try {
    const encRes = await fetch(`${ENC_API}/enc-vidlink?text=${encodeURIComponent(input.tmdbId)}`, {
      headers: { "User-Agent": VIDLINK_USER_AGENT },
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
        "User-Agent": VIDLINK_USER_AGENT,
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
