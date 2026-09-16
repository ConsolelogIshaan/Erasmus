export interface AmbientPalette {
  /** Dominant atmospheric color (deep, desaturated) */
  primary: string;
  /** Secondary complementary color field */
  secondary: string;
  /** Subtle accent/depth color field */
  accent: string;
}

export const DEFAULT_AMBIENT_PALETTE: AmbientPalette = {
  primary: "rgb(22, 28, 42)",
  secondary: "rgb(26, 22, 34)",
  accent: "rgb(16, 24, 30)",
};

/**
 * Converts RGB to HSL, clamps lightness and saturation to optimal
 * dark-mode cinematic atmospheric ranges, and returns formatted RGB.
 * Pure JS function, safe for both server and client.
 */
export function tuneForDarkAtmosphere(r: number, g: number, b: number): string {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  // Desaturate and darken to create a moody, soft atmospheric light field
  // Lightness clamped strictly between 12% and 18% to guarantee authentic depth without neon wash
  const targetL = Math.max(0.12, Math.min(0.18, l * 0.48));
  // Saturation clamped between 32% and 52% to preserve the artwork's authentic color identity
  const targetS = Math.max(0.32, Math.min(0.52, s * 0.75));

  // Convert back to RGB
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = targetL < 0.5 ? targetL * (1 + targetS) : targetL + targetS - targetL * targetS;
  const p = 2 * targetL - q;

  const finalR = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const finalG = Math.round(hue2rgb(p, q, h) * 255);
  const finalB = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);

  return `rgb(${finalR}, ${finalG}, ${finalB})`;
}
