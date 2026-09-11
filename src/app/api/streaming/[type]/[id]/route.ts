import { type NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/guard";
import { getStreamingOptions } from "@/lib/streaming/stream-resolver";

interface RouteParams {
  params: Promise<{
    type: string;
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireApiUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { type, id } = await params;
  if (type !== "movie" && type !== "tv") {
    return NextResponse.json({ error: "Invalid media type" }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const season = searchParams.get("season")
    ? parseInt(searchParams.get("season")!, 10)
    : 1;
  const episode = searchParams.get("episode")
    ? parseInt(searchParams.get("episode")!, 10)
    : 1;

  const sources = getStreamingOptions({
    type,
    tmdbId: id,
    season: Number.isNaN(season) ? 1 : season,
    episode: Number.isNaN(episode) ? 1 : episode,
  });

  return NextResponse.json(
    {
      tmdbId: id,
      type,
      season: type === "tv" ? season : undefined,
      episode: type === "tv" ? episode : undefined,
      sources,
      defaultServerId: sources[0]?.server.id ?? "lisbon",
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
