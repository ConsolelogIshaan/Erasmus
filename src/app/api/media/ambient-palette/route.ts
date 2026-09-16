import { NextRequest, NextResponse } from "next/server";
import { extractAmbientColors, DEFAULT_AMBIENT_PALETTE } from "@/lib/media/ambient-colors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imagePath = searchParams.get("path");

  if (!imagePath) {
    return NextResponse.json(DEFAULT_AMBIENT_PALETTE);
  }

  const palette = await extractAmbientColors(imagePath);
  return NextResponse.json(palette, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
