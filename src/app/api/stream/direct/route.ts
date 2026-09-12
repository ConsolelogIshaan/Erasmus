import { NextResponse } from "next/server";
import { extractDirectStream } from "@/lib/streaming/direct-stream";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "tv" ? "tv" : "movie";
  const tmdbId = searchParams.get("id") || searchParams.get("tmdbId") || "";
  const season = Number(searchParams.get("season") || 1);
  const episode = Number(searchParams.get("episode") || 1);
  const serverId = searchParams.get("server") || "lisbon";
  const title = searchParams.get("title") || undefined;
  const year = searchParams.get("year") || undefined;
  const imdbId = searchParams.get("imdb") || undefined;
  if (!tmdbId) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  const result = await extractDirectStream({
    type,
    tmdbId,
    season,
    episode,
    serverId,
    title,
    year,
    imdbId,
  });
  const status = result.ok ? 200 : 502;
  return NextResponse.json(result, { status });
}
