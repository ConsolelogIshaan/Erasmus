import {
  type AmbientPalette,
  DEFAULT_AMBIENT_PALETTE,
  tuneForDarkAtmosphere,
} from "./ambient-palette-types";

export type { AmbientPalette };
export { DEFAULT_AMBIENT_PALETTE, tuneForDarkAtmosphere };

const paletteCache = new Map<string, AmbientPalette>();
const MAX_CACHE_SIZE = 500;

/**
 * Fast, zero-overhead atmospheric color generation.
 * Produces distinct, tuned dark-mode palettes deterministically from image paths
 * without heavy WASM/libvips processing, staying well within Cloudflare Worker
 * CPU and memory limits (eliminates Cloudflare Error 1102).
 */
export async function extractAmbientColors(
  imagePath?: string | null
): Promise<AmbientPalette> {
  if (!imagePath) return DEFAULT_AMBIENT_PALETTE;

  const cached = paletteCache.get(imagePath);
  if (cached) return cached;

  try {
    let hash = 0;
    for (let i = 0; i < imagePath.length; i++) {
      hash = (Math.imul(31, hash) + imagePath.charCodeAt(i)) | 0;
    }

    const r1 = Math.abs(hash) % 256;
    const g1 = Math.abs(hash >> 8) % 256;
    const b1 = Math.abs(hash >> 16) % 256;

    const r2 = (b1 + 45) % 256;
    const g2 = (r1 * 2 + 30) % 256;
    const b2 = (g1 + 65) % 256;

    const r3 = (g1 + 85) % 256;
    const g3 = (b1 + 35) % 256;
    const b3 = (r1 * 3 + 55) % 256;

    const palette: AmbientPalette = {
      primary: tuneForDarkAtmosphere(r1, g1, b1),
      secondary: tuneForDarkAtmosphere(r2, g2, b2),
      accent: tuneForDarkAtmosphere(r3, g3, b3),
    };

    if (paletteCache.size >= MAX_CACHE_SIZE) {
      paletteCache.clear();
    }
    paletteCache.set(imagePath, palette);

    return palette;
  } catch {
    return DEFAULT_AMBIENT_PALETTE;
  }
}

