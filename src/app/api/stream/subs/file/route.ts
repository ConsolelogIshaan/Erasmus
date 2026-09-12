import { NextResponse } from "next/server";
import { loadWyzieFile } from "@/lib/streaming/wyzie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = searchParams.get("id") || "";
  const index = Number(searchParams.get("index") || 0);
  const season = searchParams.get("season");
  const episode = searchParams.get("episode");
  if (!tmdbId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  try {
    const vtt = await loadWyzieFile({
      id: tmdbId,
      index: Number.isFinite(index) ? index : 0,
      season,
      episode,
    });
    if (!vtt) {
      return NextResponse.json({ error: "no subtitle" }, { status: 502 });
    }
    return new NextResponse(vtt, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "subtitle fetch failed" }, { status: 502 });
  }
}
