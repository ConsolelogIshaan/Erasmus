import { isSrtText, srtToVtt } from "@/lib/streaming/subtitles";
import { getMediaProvider } from "@/lib/media/providers";

export interface WyzieTrack {
  display: string;
  language: string;
  url: string;
}

export interface SubtitleTrack {
  label: string;
  language: string;
  url: string;
}

const BROWSER = {
  Referer: "https://vidfast.vc/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

const LANG_NAMES: Record<string, string> = {
  en: "English",
  eng: "English",
  ara: "Arabic",
  ar: "Arabic",
  por: "Portuguese",
  pb: "Portuguese (BR)",
  pob: "Portuguese (BR)",
  pt: "Portuguese",
  swe: "Swedish",
  sv: "Swedish",
  ita: "Italian",
  it: "Italian",
  fre: "French",
  fra: "French",
  fr: "French",
  rum: "Romanian",
  ro: "Romanian",
  gre: "Greek",
  el: "Greek",
  jpn: "Japanese",
  ja: "Japanese",
  cze: "Czech",
  cs: "Czech",
  hun: "Hungarian",
  hu: "Hungarian",
  slv: "Slovenian",
  sl: "Slovenian",
  dan: "Danish",
  da: "Danish",
  spa: "Spanish",
  es: "Spanish",
  ger: "German",
  deu: "German",
  de: "German",
  pol: "Polish",
  pl: "Polish",
  rus: "Russian",
  ru: "Russian",
  chi: "Chinese",
  zho: "Chinese",
  zh: "Chinese",
  kor: "Korean",
  ko: "Korean",
  hin: "Hindi",
  hi: "Hindi",
  tur: "Turkish",
  tr: "Turkish",
  nld: "Dutch",
  nl: "Dutch",
};

const listCache = new Map<
  string,
  { at: number; tracks: WyzieTrack[]; cookies: string }
>();
const CACHE_MS = 10 * 60 * 1000;

function cacheKey(id: string, season?: string | null, episode?: string | null) {
  return `${id}:${season || ""}:${episode || ""}`;
}

function rankLanguage(language: string, label: string) {
  const hay = `${language} ${label}`.toLowerCase();
  if (hay.includes("english") || hay === "en" || hay === "eng" || hay.startsWith("en ")) {
    return 0;
  }
  if (hay.startsWith("en")) return 1;
  return 10;
}

function cookieHeader(response: Response): string {
  const raw =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  return raw
    .map((entry) => entry.split(";")[0])
    .filter(Boolean)
    .join("; ");
}

function sortTracks(tracks: WyzieTrack[]): WyzieTrack[] {
  return [...tracks].sort(
    (a, b) =>
      rankLanguage(a.language, a.display) - rankLanguage(b.language, b.display),
  );
}

async function loadVidfastList(input: {
  id: string;
  season?: string | null;
  episode?: string | null;
}): Promise<{ tracks: WyzieTrack[]; cookies: string }> {
  const wyzie = new URL("https://vidfast.vc/wyzie");
  wyzie.searchParams.set("id", input.id);
  if (input.season) wyzie.searchParams.set("season", input.season);
  if (input.episode) wyzie.searchParams.set("episode", input.episode);
  const response = await fetch(wyzie, { headers: BROWSER, redirect: "follow" });
  if (!response.ok) return { tracks: [], cookies: "" };
  const data = (await response.json()) as WyzieTrack[];
  const tracks = sortTracks(Array.isArray(data) ? data : []);
  return { tracks, cookies: cookieHeader(response) };
}

async function imdbFor(id: string, season?: string | null): Promise<{
  imdbId: string;
  kind: "movie" | "series";
} | null> {
  try {
    const provider = getMediaProvider();
    if (season) {
      const show = await provider.getTvShow(id);
      if (!show?.imdbId) return null;
      return { imdbId: show.imdbId, kind: "series" };
    }
    const movie = await provider.getMovie(id);
    if (!movie?.imdbId) return null;
    return { imdbId: movie.imdbId, kind: "movie" };
  } catch {
    return null;
  }
}

async function loadStremioList(input: {
  id: string;
  season?: string | null;
  episode?: string | null;
}): Promise<WyzieTrack[]> {
  const meta = await imdbFor(input.id, input.season);
  if (!meta) return [];
  const path =
    meta.kind === "series"
      ? `series/${meta.imdbId}:${input.season || "1"}:${input.episode || "1"}`
      : `movie/${meta.imdbId}`;
  const response = await fetch(
    `https://opensubtitles-v3.strem.io/subtitles/${path}.json`,
    { headers: { "User-Agent": BROWSER["User-Agent"] }, redirect: "follow" },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    subtitles?: Array<{ url?: string; lang?: string }>;
  };
  const seen = new Set<string>();
  const tracks: WyzieTrack[] = [];
  for (const item of data.subtitles || []) {
    if (!item.url || !item.lang) continue;
    const key = `${item.lang}:${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const language = item.lang.toLowerCase();
    tracks.push({
      display: LANG_NAMES[language] || item.lang,
      language,
      url: item.url,
    });
  }
  return sortTracks(tracks);
}

export async function loadWyzieList(input: {
  id: string;
  season?: string | null;
  episode?: string | null;
}): Promise<{ tracks: WyzieTrack[]; cookies: string }> {
  const key = cacheKey(input.id, input.season, input.episode);
  const cached = listCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS && cached.tracks.length) {
    return cached;
  }

  let result = { tracks: [] as WyzieTrack[], cookies: "" };
  try {
    result = await loadVidfastList(input);
  } catch {
    result = { tracks: [], cookies: "" };
  }
  if (!result.tracks.length) {
    try {
      result = { tracks: await loadStremioList(input), cookies: "" };
    } catch {
      result = { tracks: [], cookies: "" };
    }
  }


  if (result.tracks.length) {
    listCache.set(key, { at: Date.now(), ...result });
  }
  return result;
}

export function publicTracks(
  input: { id: string; season?: string | null; episode?: string | null },
  tracks: WyzieTrack[],
): SubtitleTrack[] {
  const query = new URLSearchParams({ id: input.id });
  if (input.season) query.set("season", input.season);
  if (input.episode) query.set("episode", input.episode);
  return tracks.map((track, index) => {
    query.set("index", String(index));
    return {
      label: track.display,
      language: track.language,
      url: `/api/stream/subs/file?${query.toString()}`,
    };
  });
}

export async function loadWyzieFile(input: {
  id: string;
  index: number;
  season?: string | null;
  episode?: string | null;
}): Promise<string | null> {
  const list = await loadWyzieList(input);
  const track = list.tracks[input.index];
  if (!track?.url) return null;

  const vidfast = track.url.includes("vidfast.vc");
  const headers: Record<string, string> = {
    "User-Agent": BROWSER["User-Agent"],
  };
  if (vidfast) {
    headers.Referer = BROWSER.Referer;
    if (list.cookies) headers.Cookie = list.cookies;
  }

  const response = await fetch(track.url, { headers, redirect: "follow" });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  return isSrtText(text) ? srtToVtt(text) : text;
}
