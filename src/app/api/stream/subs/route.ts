import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface WyzieTrack {
  display: string;
  language: string;
  url: string;
  encoding?: string;
}

function rankLanguage(language: string, label: string) {
  const hay = `${language} ${label}`.toLowerCase();
  if (hay.includes("english") || hay === "en" || hay.startsWith("en ")) return 0;
  if (hay.startsWith("en")) return 1;
  return 10;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("id") || "";
  const season = searchParams.get("season");
  const episode = searchParams.get("episode");
  if (!tmdbId) {
    return NextResponse.json({ tracks: [] }, { status: 400 });
  }

  const wyzie = new URL("https://vidfast.vc/wyzie");
  wyzie.searchParams.set("id", tmdbId);
  if (season) wyzie.searchParams.set("season", season);
  if (episode) wyzie.searchParams.set("episode", episode);

  try {
    const upstream = await fetch(wyzie, {
      headers: {
        Referer: "https://vidfast.vc/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!upstream.ok) {
      return NextResponse.json({ tracks: [] });
    }
    const data = (await upstream.json()) as WyzieTrack[];
    const tracks = (Array.isArray(data) ? data : [])
      .map((track) => ({
        label: track.display,
        language: track.language,
        url: `/api/stream/hls?url=${encodeURIComponent(track.url)}&referer=${encodeURIComponent("https://vidfast.vc/")}`,
      }))
      .sort(
        (a, b) =>
          rankLanguage(a.language, a.label) - rankLanguage(b.language, b.label),
      );
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ tracks: [] });
  }
}
