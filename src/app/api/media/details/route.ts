import { NextResponse, type NextRequest } from "next/server";
import { getMovie, getTvShow, isCatalogConfigured } from "@/lib/media/catalog";

export async function GET(request: NextRequest) {
  if (!isCatalogConfigured()) {
    return NextResponse.json({ error: "Catalog not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id || (type !== "movie" && type !== "tv")) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  try {
    if (type === "movie") {
      const movie = await getMovie(id);
      return NextResponse.json(
        {
          logoPath: movie?.logoPath ?? null,
          posterPath: movie?.posterPath ?? null,
          backdropPath: movie?.backdropPath ?? null,
          tagline: movie?.tagline ?? null,
          overview: movie?.overview ?? null,
          title: movie?.title ?? null,
          imdbId: movie?.imdbId ?? null,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        },
      );
    } else {
      const show = await getTvShow(id);
      return NextResponse.json(
        {
          logoPath: show?.logoPath ?? null,
          posterPath: show?.posterPath ?? null,
          backdropPath: show?.backdropPath ?? null,
          tagline: show?.tagline ?? null,
          overview: show?.overview ?? null,
          title: show?.title ?? null,
          imdbId: show?.imdbId ?? null,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
          },
        },
      );
    }
  } catch (err) {
    console.error("[api/media/details]", err);
    return NextResponse.json(
      { logoPath: null, posterPath: null, backdropPath: null, tagline: null, title: null },
      { status: 200 },
    );
  }
}
