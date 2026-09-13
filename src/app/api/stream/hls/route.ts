import dns from "node:dns";
try { dns.setServers(["8.8.8.8", "1.1.1.1", "9.9.9.9"]); } catch {}
import { NextResponse } from "next/server";
import { isSrtText, srtToVtt } from "@/lib/streaming/subtitles";

export const runtime = "nodejs";

const DEFAULT_REFERER = "https://cinejoy.to/";

function isHttpsUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function refererFor(requested: string | null): { referer: string; origin: string } {
  if (requested) {
    const parsed = isHttpsUrl(requested);
    if (parsed) {
      return { referer: `${parsed.origin}/`, origin: parsed.origin };
    }
  }
  return { referer: DEFAULT_REFERER, origin: "https://cinejoy.to" };
}

function proxied(relay: string, absolute: string, referer: string): string {
  const query = new URLSearchParams({ url: absolute, referer });
  return `${relay}?${query.toString()}`;
}

function enrichAudioTracks(text: string): string {
  const lines = text.split("\n");
  const audioIndices: number[] = [];
  lines.forEach((l, idx) => {
    if (l.trim().startsWith("#EXT-X-MEDIA:") && l.includes("TYPE=AUDIO")) {
      audioIndices.push(idx);
    }
  });

  if (audioIndices.length <= 1) return text;

  let hasExplicitEnglish = false;
  let englishLineIdx = -1;

  audioIndices.forEach((idx) => {
    const l = lines[idx] ?? '';
    if (
      /LANGUAGE="?(en|eng|english)"?/i.test(l) ||
      /NAME="?[^"]*(english|\beng\b)[^"]*"?/i.test(l)
    ) {
      hasExplicitEnglish = true;
      englishLineIdx = idx;
    }
  });

  const targetEnglishIdx = hasExplicitEnglish ? englishLineIdx : audioIndices[1];

  audioIndices.forEach((idx) => {
    let l = lines[idx] ?? '';
    if (idx === targetEnglishIdx) {
      l = l.replace(/DEFAULT=(YES|NO)/i, "DEFAULT=YES");
      l = l.replace(/AUTOSELECT=(YES|NO)/i, "AUTOSELECT=YES");
      if (!/LANGUAGE="[^"]+"/i.test(l)) {
        l = l.replace(/NAME="([^"]+)"/i, 'NAME="English ($1)",LANGUAGE="en"');
      }
    } else {
      l = l.replace(/DEFAULT=(YES|NO)/i, "DEFAULT=NO");
    }
    lines[idx] = l;
  });

  return lines.join("\n");
}

function rewritePlaylist(
  text: string,
  baseUrl: string,
  relay: string,
  referer: string,
): string {
  const enriched = enrichAudioTracks(text);
  return enriched
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return trimmed.replace(/URI="([^"]+)"/gi, (_, uri: string) => {
          const absolute = new URL(uri, baseUrl).href;
          return `URI="${proxied(relay, absolute, referer)}"`;
        });
      }
      const absolute = new URL(trimmed, baseUrl).href;
      return proxied(relay, absolute, referer);
    })
    .join("\n");
}

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const raw = search.get("url");
  if (!raw) {
    return NextResponse.json({ error: "missing url" }, { status: 400 });
  }
  const target = isHttpsUrl(raw);
  if (!target) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const { referer, origin } = refererFor(search.get("referer"));
  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    Referer: referer,
    Origin: origin,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  if (range) upstreamHeaders.Range = range;

  const upstream = await fetch(target, {
    headers: upstreamHeaders,
    redirect: "follow",
  });
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  const path = target.pathname.toLowerCase();
  const looksVtt = contentType.includes("vtt") || path.endsWith(".vtt");
  const looksPlaylist =
    contentType.includes("mpegurl") ||
    contentType.includes("m3u8") ||
    path.endsWith(".m3u8");
  const isHtmlMediaSegment =
    /video_\d+p_\d+\.html/i.test(path) ||
    /audio_\d+_\d+\.html/i.test(path) ||
    /_init\.html/i.test(path);
  const looksMedia =
    /video|mp4/i.test(contentType) ||
    /\.(mp4|m4s|ts)$/i.test(path) ||
    isHtmlMediaSegment;
  const relay = "/api/stream/hls";

  const playlistResponse = (text: string) =>
    new NextResponse(rewritePlaylist(text, target.href, relay, referer), {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });

  const vttResponse = (text: string) => {
    const body = isSrtText(text) ? srtToVtt(text) : text;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    });
  };

  if (looksVtt || path.endsWith(".srt")) {
    return vttResponse(await upstream.text());
  }

  if (looksPlaylist) {
    return playlistResponse(await upstream.text());
  }

  if (range || looksMedia) {
    let responseType = contentType || "application/octet-stream";
    if (isHtmlMediaSegment || /\.(mp4|m4s)$/i.test(path)) {
      responseType = path.includes("audio") ? "audio/mp4" : "video/mp4";
    }
    const passthrough: Record<string, string> = {
      "Content-Type": responseType,
      "Cache-Control": "public, max-age=3600",
      "Accept-Ranges": "bytes",
    };
    const contentRange = upstream.headers.get("content-range");
    const contentLength = upstream.headers.get("content-length");
    if (contentRange) passthrough["Content-Range"] = contentRange;
    if (contentLength) passthrough["Content-Length"] = contentLength;
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: passthrough,
    });
  }

  const buf = Buffer.from(await upstream.arrayBuffer());
  const head = buf.toString("utf8", 0, Math.min(buf.length, 16)).trimStart();
  if (head.startsWith("#EXTM3U")) {
    return playlistResponse(buf.toString("utf8"));
  }
  const text = buf.toString("utf8");
  if (head.startsWith("WEBVTT") || isSrtText(text)) {
    return vttResponse(text);
  }

  return new NextResponse(buf, {
    status: upstream.status,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=60",
      "Accept-Ranges": "bytes",
    },
  });
}
