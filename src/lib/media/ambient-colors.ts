import { backdropUrl, posterUrl } from "@/lib/media/image";
import {
  type AmbientPalette,
  DEFAULT_AMBIENT_PALETTE,
  tuneForDarkAtmosphere,
} from "./ambient-palette-types";

export type { AmbientPalette };
export { DEFAULT_AMBIENT_PALETTE, tuneForDarkAtmosphere };

const paletteCache = new Map<string, AmbientPalette>();
const MAX_CACHE_SIZE = 250;



/**
 * Server-side color extraction. Downloads a tiny thumbnail (w92/w185),
 * downsamples to 16x16 raw pixels, and extracts 3 distinct atmospheric tones.
 */
export async function extractAmbientColors(
  imagePath?: string | null
): Promise<AmbientPalette> {
  if (!imagePath) return DEFAULT_AMBIENT_PALETTE;

  const cached = paletteCache.get(imagePath);
  if (cached) return cached;

  try {
    const url = imagePath.startsWith("http")
      ? imagePath
      : backdropUrl(imagePath, "w300") ?? posterUrl(imagePath, "w185");

    if (!url) return DEFAULT_AMBIENT_PALETTE;

    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return DEFAULT_AMBIENT_PALETTE;

    const buffer = Buffer.from(await res.arrayBuffer());

    // Dynamically import sharp to ensure server-side compatibility
    const sharp = (await import("sharp")).default;

    const { data } = await sharp(buffer)
      .resize(16, 16, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const candidates: Array<{ r: number; g: number; b: number; sat: number; lum: number }> = [];

    for (let i = 0; i < data.length; i += 3) {
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);

      // Skip near-black and near-white pixels
      if (lum > 22 && lum < 238 && sat > 15) {
        candidates.push({ r, g, b, sat, lum });
      }
    }

    // Sort by saturation descending to capture the movie's signature tones
    candidates.sort((a, b) => b.sat - a.sat);

    // Pick 3 distinct color candidates (Euclidean distance > 45)
    const selected: Array<{ r: number; g: number; b: number }> = [];
    for (const c of candidates) {
      if (selected.length >= 3) break;
      const isDistinct = selected.every((s) => {
        const dist = Math.sqrt((s.r - c.r) ** 2 + (s.g - c.g) ** 2 + (s.b - c.b) ** 2);
        return dist > 45;
      });
      if (isDistinct) selected.push(c);
    }

    // If fewer than 3 were found, populate with subtle shifts of the primary or defaults
    const p1 = selected[0] ?? { r: 35, g: 45, b: 65 };
    const p2 = selected[1] ?? {
      r: Math.max(15, p1.b),
      g: Math.max(15, Math.round(p1.r * 0.8)),
      b: Math.max(15, p1.g),
    };
    const p3 = selected[2] ?? {
      r: Math.max(15, Math.round(p1.g * 0.7)),
      g: Math.max(15, p1.b),
      b: Math.max(15, Math.round(p1.r * 0.6)),
    };

    const palette: AmbientPalette = {
      primary: tuneForDarkAtmosphere(p1.r, p1.g, p1.b),
      secondary: tuneForDarkAtmosphere(p2.r, p2.g, p2.b),
      accent: tuneForDarkAtmosphere(p3.r, p3.g, p3.b),
    };

    if (paletteCache.size >= MAX_CACHE_SIZE) {
      paletteCache.clear();
    }
    paletteCache.set(imagePath, palette);

    return palette;
  } catch (error) {
    console.error("Failed to extract ambient colors:", error);
    return DEFAULT_AMBIENT_PALETTE;
  }
}
