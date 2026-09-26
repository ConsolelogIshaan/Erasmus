"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * AdaptiveLiquidGlass
 * ---------------------------------------------------------------------------
 * Apple VisionOS / macOS style "liquid glass" material.
 *
 * The glass is environmentally adaptive: it does not sit on top of a static
 * frosted tint. Instead it samples the live pixels rendered directly behind
 * it (`SourceGraphic` inside an SVG `backdrop-filter`) and physically bends
 * that content — colors, luminance, contrast — through a lens-shaped
 * displacement map. Bright/high-contrast content behind the glass blooms and
 * refracts along the rim; dark content produces a subtler, icier refraction.
 *
 * Physics model:
 * 1. A per-instance SVG filter (`glass-filter-{id}`) is attached via
 *    `backdrop-filter: url(#glass-filter-{id})`. `SourceGraphic` inside that
 *    filter is the GPU-composited backdrop — it updates every frame with
 *    zero JS/DOM scroll overhead, so whatever is scrolling behind the panel
 *    (posters, backdrops, colors) is what gets bent, live.
 * 2. A dynamic lens heightmap is generated from the container's measured
 *    bounding box (via ResizeObserver) and fed in through `<feImage>`. The
 *    whole panel is treated as one continuous curved surface — like a
 *    squircle-shaped dome — rather than a flat window with only its rim
 *    bent: displacement is zero at the exact center and eases outward
 *    (flat at first, steepening near the border) toward every edge, so the
 *    entire visible area of the panel refracts, with the strongest bend
 *    naturally landing at the border where a real lens curves most
 *    steeply. Encoded as two independent radial gradients — X push (red
 *    channel) and Y push (green channel) — each centered on the panel, so
 *    the displacement always points outward from the middle, matching how
 *    a convex lens spreads light apart toward its edges.
 * 3. A single `feDisplacementMap` pass does the actual bending (one
 *    coherent, full-color image — an earlier version ran three redundant,
 *    channel-gutted copies re-blended with `screen`, which fought each
 *    other and smeared the whole image instead of reading as glass). A
 *    second pass re-displaces at a slightly larger scale, keeps only its
 *    blue channel (blue bends most in a real prism), dims it, and screens
 *    it back over the primary — a faint chromatic fringe at the edges
 *    without disturbing the primary, coherent image underneath.
 *
 * Content placed as `children` renders in a `position: relative; z-index: 10`
 * layer above the glass and is never affected by the filter.
 */

export interface AdaptiveLiquidGlassProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Sharp foreground content rendered above the glass. Optional when used purely as a background layer. */
  children?: React.ReactNode;
  /** Corner radius applied to the glass container. Defaults to "inherit" so it can match a parent's rounded-* class. */
  radius?: number | string;
  /**
   * Displacement strength in px at the panel's edge (zero at the exact
   * center, easing up to this value at the border). Higher values bend
   * the backdrop more dramatically across the whole surface. Defaults to
   * 34 — enough to visibly bend posters/backdrops across the full panel
   * without tearing the image apart.
   */
  displacementScale?: number;
  /** Opacity (0–1) of the secondary, slightly-offset displacement pass that adds a faint chromatic fringe near the edges. Set to 0 to disable. Defaults to 0.35. */
  chromaticFringe?: number;
  /** Base tint opacity behind the glass (0–0.4 recommended; higher smothers backdrop adaptation). Defaults to 0.14. */
  tintOpacity?: number;
  /** Disables the filter and falls back to a plain blur (useful for reduced-motion / low-power preference). */
  forceFallback?: boolean;
}

function supportsSvgBackdropFilter(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined" || !CSS.supports) {
    return false;
  }
  // Firefox and WebKit (Safari / iOS) do not support SVG filter references
  // inside backdrop-filter. Feature-detect rather than UA-sniff.
  try {
    return CSS.supports("backdrop-filter", "url(#test)");
  } catch {
    return false;
  }
}

/**
 * Builds the data: URI heightmap used by <feImage>.
 *
 * Models the whole panel as one convex dome: an X-direction push (red
 * channel) and a Y-direction push (green channel), each built from a
 * radial gradient centered on the panel so the value is neutral (rgb 128 =
 * zero displacement) at the exact center and eases up toward the edges.
 * The gradient's intermediate stops are placed to approximate a dome's
 * slope directly (flat near the middle, steepening near the border)
 * rather than a straight linear cone, so the center stays exactly neutral
 * while the border carries the strongest push — matching how a real lens
 * curves most steeply at its edge. Because this covers the *entire* panel
 * rather than just a border band, every part of the glass refracts the
 * backdrop directly behind it — a poster scrolling under the left third
 * of the panel bends differently than one under the right third — while
 * still landing its strongest bend at the edges, same as a real curved
 * pane. Regenerated whenever the glass container is resized.
 */
function buildHeightMapDataUri(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <!-- X push (red channel only): 128 (no x-displacement) at the exact
             center, easing — flat at first, then steepening — out to 255
             (full outward push) at the horizontal edges. The intermediate
             stops approximate a dome's slope directly in gradient-stop
             space, so the center stays precisely neutral without needing a
             post-hoc gamma pass that would also disturb it. -->
        <radialGradient id="domeX" cx="50%" cy="50%" r="70.7%">
          <stop offset="0%" stop-color="rgb(128,128,128)" />
          <stop offset="40%" stop-color="rgb(134,128,128)" />
          <stop offset="70%" stop-color="rgb(165,128,128)" />
          <stop offset="100%" stop-color="rgb(255,128,128)" />
        </radialGradient>
        <!-- Y push (green channel only): same eased falloff, driving vertical displacement. -->
        <radialGradient id="domeY" cx="50%" cy="50%" r="70.7%">
          <stop offset="0%" stop-color="rgb(128,128,128)" />
          <stop offset="40%" stop-color="rgb(128,134,128)" />
          <stop offset="70%" stop-color="rgb(128,165,128)" />
          <stop offset="100%" stop-color="rgb(128,255,128)" />
        </radialGradient>
      </defs>

      <!-- Neutral backdrop in case the radial gradients don't fully cover a non-square panel. -->
      <rect x="0" y="0" width="${w}" height="${h}" fill="rgb(128,128,128)" />

      <!-- "lighten" keeps each channel's own maximum rather than averaging, so the
           independent R (domeX) and G (domeY) pushes don't wash each other out. -->
      <g style="mix-blend-mode: lighten">
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#domeX)" />
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#domeY)" style="mix-blend-mode: lighten" />
      </g>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function AdaptiveLiquidGlass({
  children,
  className,
  radius = "inherit",
  displacementScale = 34,
  chromaticFringe = 0.35,
  tintOpacity = 0.14,
  forceFallback = false,
  style,
  ...rest
}: AdaptiveLiquidGlassProps) {
  const reactId = React.useId().replace(/[:]/g, "");
  const filterId = `glass-filter-${reactId}`;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const feImageRef = React.useRef<SVGFEImageElement>(null);

  const [supportsFilter, setSupportsFilter] = React.useState(false);

  React.useEffect(() => {
    setSupportsFilter(!forceFallback && supportsSvgBackdropFilter());
  }, [forceFallback]);

  // Regenerate the lens heightmap whenever the panel's measured size changes.
  React.useEffect(() => {
    const container = containerRef.current;
    const feImage = feImageRef.current;
    if (!container || !feImage) return;

    const update = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const uri = buildHeightMapDataUri(rect.width, rect.height);
      feImage.setAttribute("href", uri);
      feImage.setAttribute("xlink:href", uri);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scale = Math.abs(displacementScale);
  // The fringe pass runs at a slightly larger scale than the primary pass so
  // its edges land a few px further out, then gets blended in at low opacity
  // — enough to read as a faint prismatic edge without duplicating/smearing
  // the whole image the way three full-strength channel-isolated passes did.
  const fringeScale = scale * 1.18;

  return (
    <div
      ref={containerRef}
      className={cn("relative isolate overflow-hidden", className)}
      style={{ borderRadius: radius, ...style }}
      {...rest}
    >
      {/* Glass background layer — strictly behind children, never affects them. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 liquid-glass-compositing"
        style={{
          borderRadius: "inherit",
          background: `hsl(0 0% 0% / ${tintOpacity})`,
          backdropFilter: supportsFilter
            ? `url(#${filterId}) saturate(1.1)`
            : "blur(14px) saturate(1.8) brightness(1.05)",
          WebkitBackdropFilter: supportsFilter
            ? `url(#${filterId}) saturate(1.1)`
            : "blur(14px) saturate(1.8) brightness(1.05)",
          boxShadow: [
            "0 0 0 0.5px rgba(255, 255, 255, 0.12) inset",
            "0px 4px 16px rgba(0, 0, 0, 0.1)",
            "0px 8px 24px rgba(0, 0, 0, 0.08)",
          ].join(", "),
        }}
      />

      {/* SVG filter graph: lives off-screen, only referenced via backdrop-filter url(). */}
      {supportsFilter ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          style={{ position: "absolute" }}
        >
          <defs>
            <filter
              id={filterId}
              colorInterpolationFilters="sRGB"
              x="0%"
              y="0%"
              width="100%"
              height="100%"
            >
              {/* Dynamically generated lens heightmap */}
              <feImage
                ref={feImageRef}
                x="0"
                y="0"
                width="100%"
                height="100%"
                preserveAspectRatio="none"
                result="map"
              />

              {/* Primary bend: one coherent, full-color displaced copy of the
                  backdrop. This alone is what makes the whole panel read as
                  glass — every pixel samples from slightly further out
                  toward the edges, radially, with zero shift dead center. */}
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={scale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="primary"
              />

              {/* Faint chromatic fringe: the blue channel is re-displaced at a
                  slightly larger scale than the primary pass, so it samples
                  from a touch further out — a real prism splits color by
                  wavelength, and blue bends the most. Dimming it before
                  screening it back over the full-strength primary keeps the
                  primary image intact and just tints its edges, instead of
                  the old approach of screening three equally-weighted,
                  channel-gutted copies, which fought each other and
                  smeared the whole image. */}
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={fringeScale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="fringeRaw"
              />
              <feComponentTransfer in="fringeRaw" result="fringe">
                <feFuncR type="linear" slope="0" intercept="0" />
                <feFuncG type="linear" slope="0" intercept="0" />
                <feFuncB type="linear" slope={chromaticFringe} intercept="0" />
                <feFuncA type="linear" slope={chromaticFringe} intercept="0" />
              </feComponentTransfer>

              <feBlend in="primary" in2="fringe" mode="screen" result="dispersed" />

              {/* Caustic smoothing */}
              <feGaussianBlur in="dispersed" stdDeviation="0.5" />
            </filter>
          </defs>
        </svg>
      ) : null}

      {/* Foreground content — sharp, unaffected, always above the glass. */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
