import { NextResponse } from "next/server";
import { loadWyzieList, publicTracks } from "@/lib/streaming/wyzie";
import { getMediaProvider } from "@/lib/media/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("id") || "";
  const imdbId = searchParams.get("imdb") || searchParams.get("imdbId") || undefined;
  const season = searchParams.get("season");
  const episode = searchParams.get("episode");
  if (!tmdbId && !imdbId) {
    return NextResponse.json({ tracks: [] }, { status: 400 });
  }

  try {
    let resolvedImdb = imdbId;
    if (!resolvedImdb) {
      try {
        const provider = getMediaProvider();
        if (season) {
          const show = await provider.getTvShow(tmdbId);
          resolvedImdb = show?.imdbId || undefined;
        } else {
          const movie = await provider.getMovie(tmdbId);
          resolvedImdb = movie?.imdbId || undefined;
        }
      } catch {}
    }

    const res = await loadWyzieList({
      id: tmdbId,
      season,
      episode,
      imdbId: resolvedImdb,
      bypassCache: true,
    });

    return NextResponse.json({
      tracks: publicTracks({ id: tmdbId, season, episode }, res.tracks),
      debug: res.debug,
    });
  } catch (err: unknown) {
    return NextResponse.json({ tracks: [], error: (err as Error)?.message });
  }
}
