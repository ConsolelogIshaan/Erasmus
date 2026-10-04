import { NextResponse, type NextRequest } from "next/server";
import { fetchImdbRatings, MAX_IMDB_LOOKUPS_PER_BATCH } from "@/lib/media/imdb";

export async function GET(request: NextRequest) {
  const keys = [...new Set((request.nextUrl.searchParams.get("items") ?? "").split(","))];
  if (keys.length > MAX_IMDB_LOOKUPS_PER_BATCH || keys.some((key) => !/^(movie|tv):[1-9]\d{0,11}$/.test(key))) {
    return NextResponse.json({ error: "Invalid titles" }, { status: 400 });
  }
  const items = keys.map((key) => {
    const [mediaType, id] = key.split(":");
    return { mediaType: mediaType as "movie" | "tv", id: id! };
  });
  const ratings = await fetchImdbRatings(items);
  return NextResponse.json(Object.fromEntries(keys.map((key) => [key, ratings.get(key)?.rating ?? null])), {
    headers: { "Cache-Control": `public, max-age=300, s-maxage=${ratings.size === keys.length ? 86400 : 300}` },
  });
}
