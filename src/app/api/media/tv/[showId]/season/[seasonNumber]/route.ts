import { NextResponse, type NextRequest } from "next/server";

import { getTvSeason, isCatalogConfigured } from "@/lib/media/catalog";

interface RouteContext {
  params: Promise<{ showId: string; seasonNumber: string }>;
}

/**
 * GET /api/media/tv/:showId/season/:seasonNumber
 *
 * Public catalog endpoint serving season episode checklists and in-player
 * episode selectors across all visitors. Cached for fast subsequent opens.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  if (!isCatalogConfigured()) {
    return NextResponse.json({ error: "Catalog not configured" }, { status: 503 });
  }

  const { showId, seasonNumber } = await context.params;

  // TMDB ids are numeric and season numbers are small non-negative integers.
  const validShowId = /^\d{1,12}$/.test(showId);
  const season = Number(seasonNumber);
  const validSeason = Number.isInteger(season) && season >= 0 && season <= 1000;

  if (!validShowId || !validSeason) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  try {
    const data = await getTvSeason(showId, season);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[api/media/tv/season]", error);
    return NextResponse.json({ error: "Failed to load season" }, { status: 502 });
  }
}
