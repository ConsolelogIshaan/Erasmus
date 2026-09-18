import { NextResponse } from "next/server";
import { loadWyzieFile } from "@/lib/streaming/wyzie";
import { isAssText, assToVtt, isSrtText, srtToVtt } from "@/lib/streaming/subtitles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const externalUrl = searchParams.get("url");

  if (externalUrl) {
    try {
      const response = await fetch(externalUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Referer: "https://cinejoy.to/",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        return NextResponse.json({ error: "failed to fetch external subtitle" }, { status: 502 });
      }

      const buffer = await response.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        return NextResponse.json({ error: "empty subtitle" }, { status: 502 });
      }

      let text: string;
      const bytes = new Uint8Array(buffer);
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const { gunzipSync } = await import("node:zlib");
        text = gunzipSync(Buffer.from(buffer)).toString("utf-8");
      } else {
        text = new TextDecoder("utf-8").decode(buffer);
      }

      let vtt = text;
      if (isAssText(text)) {
        vtt = assToVtt(text);
      } else if (isSrtText(text)) {
        vtt = srtToVtt(text);
      }
      return new NextResponse(vtt, {
        headers: {
          "Content-Type": "text/vtt; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "subtitle fetch failed" }, { status: 502 });
    }
  }

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
