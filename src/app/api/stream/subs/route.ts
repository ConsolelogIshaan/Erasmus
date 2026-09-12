import { NextResponse } from "next/server";
import { loadWyzieList, publicTracks } from "@/lib/streaming/wyzie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("id") || "";
  const season = searchParams.get("season");
  const episode = searchParams.get("episode");
  if (!tmdbId) {
    return NextResponse.json({ tracks: [] }, { status: 400 });
  }

  try {
    const { tracks } = await loadWyzieList({
      id: tmdbId,
      season,
      episode,
    });
    return NextResponse.json({
      tracks: publicTracks({ id: tmdbId, season, episode }, tracks),
    });
  } catch {
    return NextResponse.json({ tracks: [] });
  }
}
