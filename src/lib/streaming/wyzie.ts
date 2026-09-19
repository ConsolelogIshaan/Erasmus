import { isAssText, assToVtt, isSrtText, srtToVtt, NORM_LANG, LANG_NAMES, LANG_FLAGS } from "@/lib/streaming/subtitles";
import { getMediaProvider } from "@/lib/media/providers";
import { getAlternateTvCoordinates } from "@/lib/streaming/vidfast-direct";

export interface WyzieTrack {
  display: string;
  language: string;
  url: string;
  isExternal?: boolean;
  hearingImpaired?: boolean;
}

export interface SubtitleTrack {
  label: string;
  language: string;
  url: string;
  isExternal?: boolean;
  hearingImpaired?: boolean;
}

const BROWSER = {
  Referer: "https://vidfast.vc/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

export { NORM_LANG, LANG_NAMES, LANG_FLAGS };


const listCache = new Map<
  string,
  { at: number; tracks: WyzieTrack[]; cookies: string }
>();
const CACHE_MS = 15 * 60 * 1000;

function cacheKey(id: string, season?: string | null, episode?: string | null) {
  return `${id}:${season || ""}:${episode || ""}`;
}

function rankLanguage(language: string, label: string) {
  const norm = NORM_LANG[language.toLowerCase()] || language.toLowerCase();
  const hay = `${norm} ${label}`.toLowerCase();
  if (hay.includes("english") || norm === "en" || hay.startsWith("en ") || hay.startsWith("en-")) {
    return 0;
  }
  if (norm === "es" || hay.includes("spanish")) return 1;
  if (norm === "fr" || hay.includes("french")) return 2;
  if (norm === "de" || hay.includes("german")) return 3;
  if (norm === "pt-br" || norm === "pt" || hay.includes("portuguese")) return 4;
  if (norm === "ar" || hay.includes("arabic")) return 5;
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
  return [...tracks].sort((a, b) => {
    const rankA = rankLanguage(a.language, a.display);
    const rankB = rankLanguage(b.language, b.display);
    if (rankA !== rankB) return rankA - rankB;
    return a.display.localeCompare(b.display);
  });
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
  const response = await fetch(wyzie, {
    headers: BROWSER,
    redirect: "follow",
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) return { tracks: [], cookies: "" };
  const data = (await response.json()) as WyzieTrack[];
  if (!Array.isArray(data)) return { tracks: [], cookies: "" };
  const tracks: WyzieTrack[] = data.map((t) => {
    const norm = NORM_LANG[t.language.toLowerCase()] || t.language.toLowerCase();
    return {
      display: t.display || LANG_NAMES[norm] || t.language,
      language: norm,
      url: t.url,
      isExternal: false,
    };
  });
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
    console.log("[wyzie] getMovie for", id, "-> imdbId:", movie?.imdbId);
    if (!movie?.imdbId) return null;
    return { imdbId: movie.imdbId, kind: "movie" };
  } catch (err) {
    console.error("[wyzie] imdbFor error:", err);
    return null;
  }
}

interface StremioSubtitleItem {
  id?: string;
  url?: string;
  lang?: string;
  subtitleFileName?: string;
  movieReleaseName?: string;
  releaseGroup?: string;
  releaseFormat?: string;
}

async function loadStremioList(
  meta: { imdbId: string; kind: "movie" | "series" },
  season?: string | null,
  episode?: string | null,
): Promise<WyzieTrack[]> {
  try {
    const path =
      meta.kind === "series"
        ? `series/${meta.imdbId}:${season || "1"}:${episode || "1"}`
        : `movie/${meta.imdbId}`;
    const response = await fetch(
      `https://opensubtitles-v3.strem.io/subtitles/${path}.json`,
      {
        headers: { "User-Agent": BROWSER["User-Agent"] },
        redirect: "follow",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      subtitles?: StremioSubtitleItem[];
    };
    const tracks: WyzieTrack[] = [];
    const seen = new Set<string>();

    for (const item of data.subtitles || []) {
      if (!item.url || !item.lang) continue;
      const normLang = NORM_LANG[item.lang.toLowerCase()] || item.lang.toLowerCase();
      const rawTitle = (item.subtitleFileName || item.movieReleaseName || "").trim();
      const title =
        rawTitle.replace(/\.srt$/i, "").replace(/\.vtt$/i, "") ||
        LANG_NAMES[normLang] ||
        item.lang;

      const key = `${normLang}:${item.url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      tracks.push({
        display: title,
        language: normLang,
        url: item.url,
        isExternal: true,
      });
    }
    return tracks;
  } catch {
    return [];
  }
}

interface OpenSubtitlesRestItem {
  SubFileName?: string;
  MovieReleaseName?: string;
  SubLanguageID?: string;
  LanguageName?: string;
  SubDownloadLink?: string;
  IDSubtitleFile?: string;
  SubHearingImpaired?: string | number;
}

async function loadOpenSubtitlesList(
  meta: { imdbId: string; kind: "movie" | "series" },
  season?: string | null,
  episode?: string | null,
): Promise<WyzieTrack[]> {
  try {
    const numericId = meta.imdbId.replace(/\D/g, "").padStart(7, "0");
    const urls: string[] = [];

    if (meta.kind === "series") {
      const s = season || "1";
      const e = episode || "1";
      urls.push(
        `https://rest.opensubtitles.org/search/episode-${e}/imdbid-${numericId}/season-${s}`,
      );
      urls.push(
        `https://rest.opensubtitles.org/search/episode-${e}/imdbid-${numericId}/season-${s}/sublanguageid-eng`,
      );
    } else {
      urls.push(`https://rest.opensubtitles.org/search/imdbid-${numericId}`);
      urls.push(
        `https://rest.opensubtitles.org/search/imdbid-${numericId}/sublanguageid-eng`,
      );
    }

    const settled = await Promise.allSettled(
      urls.map(async (u) => {
        const res = await fetch(u, {
          headers: { "User-Agent": "TemporaryUserAgent" },
          redirect: "follow",
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return [];
        return (await res.json()) as OpenSubtitlesRestItem[];
      }),
    );

    const tracks: WyzieTrack[] = [];
    const seen = new Set<string>();

    for (const r of settled) {
      if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
      for (const item of r.value) {
        const rawLang = (item.SubLanguageID || "").toLowerCase();
        const normLang = NORM_LANG[rawLang] || rawLang || "en";
        const fileId = item.IDSubtitleFile;
        const downloadLink = item.SubDownloadLink;

        // Use Stremio's high-speed pre-decompressed UTF8 CDN if fileId is present, or download link
        const url = fileId
          ? `https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/${fileId}`
          : downloadLink;
        if (!url) continue;

        const rawTitle = (item.SubFileName || item.MovieReleaseName || "").trim();
        const title =
          rawTitle.replace(/\.srt$/i, "").replace(/\.vtt$/i, "") ||
          LANG_NAMES[normLang] ||
          item.LanguageName ||
          "Subtitle";

        const key = `${normLang}:${title}`;
        if (seen.has(key)) continue;
        seen.add(key);

        tracks.push({
          display: title,
          language: normLang,
          url,
          isExternal: true,
          hearingImpaired:
            item.SubHearingImpaired === "1" || item.SubHearingImpaired === 1,
        });
      }
    }

    return tracks;
  } catch {
    return [];
  }
}

export async function loadWyzieList(input: {
  id: string;
  season?: string | null;
  episode?: string | null;
  imdbId?: string | null;
  title?: string | null;
  bypassCache?: boolean;
}): Promise<{ tracks: WyzieTrack[]; cookies: string; debug?: unknown }> {
  const key = cacheKey(input.id, input.season, input.episode);
  const cached = listCache.get(key);
  // Only use cache if it has rich external tracks (> 30) and not bypassed
  if (!input.bypassCache && cached && Date.now() - cached.at < CACHE_MS && cached.tracks.length > 30) {
    return cached;
  }

  let meta: { imdbId: string; kind: "movie" | "series" } | null = null;
  if (input.imdbId && input.imdbId.startsWith("tt")) {
    meta = { imdbId: input.imdbId, kind: input.season ? "series" : "movie" };
  } else if (input.id && input.id.startsWith("tt")) {
    meta = { imdbId: input.id, kind: input.season ? "series" : "movie" };
  } else {
    meta = await imdbFor(input.id, input.season);
  }

  // 1. Fetch default Vidfast list
  const vidfastPromise = loadVidfastList(input).catch(() => ({
    tracks: [] as WyzieTrack[],
    cookies: "",
  }));

  // 2. Fetch external releases via IMDb metadata lookup with smart cour / absolute numbering fallback
  const externalPromise = (async (): Promise<{ stremioCount: number; osCount: number; tracks: WyzieTrack[] }> => {
    if (!meta) return { stremioCount: 0, osCount: 0, tracks: [] };
    let [stremioTracks, osTracks] = await Promise.all([
      loadStremioList(meta, input.season, input.episode).catch((err) => {
        console.error("[wyzie] Stremio fetch failed:", err);
        return [];
      }),
      loadOpenSubtitlesList(meta, input.season, input.episode).catch((err) => {
        console.error("[wyzie] OpenSubtitles fetch failed:", err);
        return [];
      }),
    ]);

    // If series returned 0 tracks, try alternate cour/absolute coordinates (e.g. S1E24 -> S2E12 for Solo Leveling)
    if (meta.kind === "series" && input.season && input.episode && stremioTracks.length === 0 && osTracks.length === 0) {
      const sNum = parseInt(input.season, 10);
      const eNum = parseInt(input.episode, 10);
      if (!isNaN(sNum) && !isNaN(eNum)) {
        const alternates = getAlternateTvCoordinates(sNum, eNum);
        for (const alt of alternates) {
          const [altStremio, altOs] = await Promise.all([
            loadStremioList(meta, String(alt.season), String(alt.episode)).catch(() => []),
            loadOpenSubtitlesList(meta, String(alt.season), String(alt.episode)).catch(() => []),
          ]);
          if (altStremio.length > 0 || altOs.length > 0) {
            console.log(`[wyzie] Discovered ${altStremio.length + altOs.length} subtitles for ${input.id} via alternate S${alt.season}E${alt.episode} (${alt.reason})`);
            stremioTracks = altStremio;
            osTracks = altOs;
            break;
          }
        }
      }
    }

    return {
      stremioCount: stremioTracks.length,
      osCount: osTracks.length,
      tracks: [...stremioTracks, ...osTracks],
    };
  })().catch((err) => {
    console.error("[wyzie] externalPromise failed:", err);
    return { stremioCount: 0, osCount: 0, tracks: [] };
  });

  const [vidfastRes, externalResult] = await Promise.all([
    vidfastPromise,
    externalPromise,
  ]);

  const externalTracks = externalResult.tracks;

  // 3. Merge and deduplicate
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const merged: WyzieTrack[] = [];

  // Add Vidfast tracks first (default stream provider options)
  for (const t of vidfastRes.tracks) {
    seenUrls.add(t.url);
    seenTitles.add(`${t.language}:${t.display.toLowerCase()}`);
    merged.push(t);
  }

  // Add all rich external release tracks
  for (const t of externalTracks) {
    const titleKey = `${t.language}:${t.display.toLowerCase()}`;
    if (!seenUrls.has(t.url) && !seenTitles.has(titleKey)) {
      seenUrls.add(t.url);
      seenTitles.add(titleKey);
      merged.push(t);
    }
  }

  const sorted = sortTracks(merged);
  const result = {
    tracks: sorted,
    cookies: vidfastRes.cookies,
    debug: {
      meta,
      vidfastCount: vidfastRes.tracks.length,
      stremioCount: externalResult.stremioCount,
      osCount: externalResult.osCount,
      totalMerged: sorted.length,
    },
  };

  if (sorted.length > 0) {
    listCache.set(key, { at: Date.now(), tracks: sorted, cookies: vidfastRes.cookies });
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
      isExternal: track.isExternal,
      hearingImpaired: track.hearingImpaired,
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

  const response = await fetch(track.url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;

  const buffer = await response.arrayBuffer();
  if (!buffer || buffer.byteLength === 0) return null;

  let text: string;
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const { gunzipSync } = await import("node:zlib");
    text = gunzipSync(Buffer.from(buffer)).toString("utf-8");
  } else {
    text = new TextDecoder("utf-8").decode(buffer);
  }

  if (!text.trim()) return null;
  if (isAssText(text)) return assToVtt(text);
  return isSrtText(text) ? srtToVtt(text) : text;
}
