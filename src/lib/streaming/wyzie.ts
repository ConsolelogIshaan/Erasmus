import { isSrtText, srtToVtt } from "@/lib/streaming/subtitles";

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
  Origin: "https://vidfast.vc",
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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
  if (hay.includes("english") || hay === "en" || hay.startsWith("en ")) return 0;
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

export async function loadWyzieList(input: {
  id: string;
  season?: string | null;
  episode?: string | null;
}): Promise<{ tracks: WyzieTrack[]; cookies: string }> {
  const key = cacheKey(input.id, input.season, input.episode);
  const cached = listCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;

  const wyzie = new URL("https://vidfast.vc/wyzie");
  wyzie.searchParams.set("id", input.id);
  if (input.season) wyzie.searchParams.set("season", input.season);
  if (input.episode) wyzie.searchParams.set("episode", input.episode);

  const response = await fetch(wyzie, { headers: BROWSER, redirect: "follow" });
  if (!response.ok) return { tracks: [], cookies: "" };
  const data = (await response.json()) as WyzieTrack[];
  const tracks = (Array.isArray(data) ? data : []).sort(
    (a, b) =>
      rankLanguage(a.language, a.display) - rankLanguage(b.language, b.display),
  );
  const result = { tracks, cookies: cookieHeader(response) };
  listCache.set(key, { at: Date.now(), ...result });
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

  const headers: Record<string, string> = { ...BROWSER };
  if (list.cookies) headers.Cookie = list.cookies;

  const response = await fetch(track.url, { headers, redirect: "follow" });
  if (!response.ok) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  return isSrtText(text) ? srtToVtt(text) : text;
}
