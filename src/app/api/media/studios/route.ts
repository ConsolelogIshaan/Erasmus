import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, checkRateLimit, rateLimitedResponse } from "@/lib/api/guard";
import {
  getStudio,
  parseStudioFilters,
  STUDIO_REGIONS,
  STUDIO_SORTS,
} from "@/features/studios/config";
import { getStudioCatalog } from "@/features/studios/catalog";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const limit = checkRateLimit("studio-pages", auth.userId, 30, 60_000);
  if (!limit.ok) return rateLimitedResponse(limit.retryAfterSeconds);
  const params = request.nextUrl.searchParams;
  const studio = getStudio(params.get("studio") || "");
  const page = Number(params.get("page"));
  if (
    !studio ||
    !["movie", "tv"].includes(params.get("type") || "") ||
    !STUDIO_REGIONS.some((r) => r.code === params.get("region")) ||
    !STUDIO_SORTS.some((s) => s.value === params.get("sort")) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 500
  ) {
    return NextResponse.json(
      { error: "Invalid studio catalog request" },
      { status: 400 },
    );
  }
  const filters = parseStudioFilters(Object.fromEntries(params), studio);
  try {
    const result = await getStudioCatalog(studio, filters);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not verify this catalog page. Please retry." },
      { status: 502 },
    );
  }
}
