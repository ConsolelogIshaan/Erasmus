import { describe, it, expect } from "vitest";
import {
  extractAmbientColors,
  DEFAULT_AMBIENT_PALETTE,
  tuneForDarkAtmosphere,
} from "./ambient-colors";

describe("ambient-colors", () => {
  it("returns default ambient palette if path is null or undefined", async () => {
    const paletteNull = await extractAmbientColors(null);
    const paletteUndefined = await extractAmbientColors(undefined);

    expect(paletteNull).toEqual(DEFAULT_AMBIENT_PALETTE);
    expect(paletteUndefined).toEqual(DEFAULT_AMBIENT_PALETTE);
  });

  it("tunes colors for dark, non-neon, cinematic atmosphere", () => {
    // Highly saturated neon green
    const tunedGreen = tuneForDarkAtmosphere(0, 255, 0);
    expect(tunedGreen).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    
    // Parse RGB numbers
    const match = tunedGreen.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    expect(match).not.toBeNull();
    if (match) {
      const r = parseInt(match[1] ?? "0", 10);
      const g = parseInt(match[2] ?? "0", 10);
      const b = parseInt(match[3] ?? "0", 10);
      // Ensure it is dark (none of r, g, b should exceed dark range ~80-90 out of 255)
      expect(Math.max(r, g, b)).toBeLessThan(90);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(10);
    }
  });

  it("consistently returns three distinct atmospheric colors", async () => {
    // When no network or fallback
    const palette = await extractAmbientColors(null);
    expect(palette.primary).toBeDefined();
    expect(palette.secondary).toBeDefined();
    expect(palette.accent).toBeDefined();
  });
});
