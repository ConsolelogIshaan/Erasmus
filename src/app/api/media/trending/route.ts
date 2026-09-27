import { NextResponse } from "next/server";

import { getMediaProvider } from "@/lib/media/providers";
import { isCatalogConfigured } from "@/lib/media/catalog";

/**
 * Trending titles for the search page and command palette empty state.
 * Edge-cached globally across Cloudflare Anycast POPs for 24h to guarantee 0ms Worker CPU.
 */
export async function GET() {
  if (!isCatalogConfigured()) {
    return NextResponse.json({ results: [] }, { status: 503 });
  }

  try {
    const data = await getMediaProvider().getTrending("all", "day");
    return NextResponse.json(
      {
        results: data.results.slice(0, 20).map((item) => ({
          id: item.id,
          kind: item.mediaType,
          title: item.title,
          subtitle: item.mediaType === "tv" ? "TV" : "Movie",
          imagePath: item.posterPath,
          year: item.releaseDate ? item.releaseDate.slice(0, 4) : null,
          mediaType: item.mediaType,
          href: item.mediaType === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`,
          popularity: item.popularity,
          voteAverage: typeof item.voteAverage === "number" ? item.voteAverage : null,
        })),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          "CDN-Cache-Control": "public, max-age=86400",
        },
      },
    );
  } catch (error) {
    console.error("[api/media/trending]", error);
    return NextResponse.json({ results: [] }, { status: 502 });
  }
}
