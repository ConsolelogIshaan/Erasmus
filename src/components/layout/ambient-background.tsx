"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAmbient, type AmbientTheme } from "@/providers/ambient-provider";

function AmbientLayer({ theme }: { theme: AmbientTheme }) {
  const { palette, backdropUrl } = theme;

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {/* 1. Ultra-soft Diffused Backdrop Art (natural spatial distribution of the movie's authentic colors) */}
      {backdropUrl ? (
        <div
          className="absolute inset-x-0 top-0 h-[min(90vh,58rem)] overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 35%, rgba(0,0,0,0.5) 65%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 35%, rgba(0,0,0,0.5) 65%, transparent 100%)",
          }}
        >
          <img
            src={backdropUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover select-none scale-135 filter blur-[110px] saturate-[1.25] opacity-[0.22]"
          />
        </div>
      ) : null}

      {/* 2. Primary Atmospheric Light Field (near hero: stronger) */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 105% 85% at 20% 12%, ${palette.primary} 0%, transparent 72%)`,
          opacity: 0.85,
        }}
      />

      {/* 3. Secondary Atmospheric Light Field (below hero: still clearly present) */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 95% 90% at 82% 38%, ${palette.secondary} 0%, transparent 68%)`,
          opacity: 0.75,
        }}
      />

      {/* 4. Expansive Middle Atmospheric Field (middle of page: soft but visible) */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 110% 85% at 28% 65%, ${palette.secondary} 0%, transparent 72%)`,
          opacity: 0.55,
        }}
      />

      {/* 5. Lower Page Atmospheric Tail (lower page: very soft atmosphere) */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 100% 75% at 68% 82%, ${palette.accent} 0%, transparent 75%)`,
          opacity: 0.38,
        }}
      />
    </div>
  );
}

/**
 * Dedicated Page-Level Ambient Background System.
 * Sits persistently behind all scrollable sections in AppShell,
 * creating an enormous, seamless, cinematic light field derived from
 * the current movie/show's artwork that continues down the entire page
 * with natural atmospheric depth (stronger near hero, soft through middle, dark at bottom).
 *
 * Transitions between titles are executed with Framer Motion AnimatePresence,
 * crossfading the full atmospheric aura with a velvety 1.6s ease-in-out curve
 * and an overlapping dissolve with zero brightness dip for organic environment blending.
 */
export function AmbientBackground() {
  const { currentTheme } = useAmbient();

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#07090c] select-none"
      aria-hidden
    >
      <AnimatePresence mode="popLayout">
        <motion.div
          key={currentTheme.id}
          className="absolute inset-0 will-change-[opacity]"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: {
              duration: 1.6,
              ease: [0.22, 1, 0.36, 1],
            },
          }}
          exit={{
            opacity: 0,
            transition: {
              duration: 1.4,
              delay: 0.15,
              ease: [0.22, 1, 0.36, 1],
            },
          }}
          aria-hidden
        >
          <AmbientLayer theme={currentTheme} />
        </motion.div>
      </AnimatePresence>

      {/* Master Vertical Depth Dissolve (stronger near hero -> softer -> eventually dark at bottom) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 18%, rgba(7,9,12,0.18) 38%, rgba(7,9,12,0.45) 60%, rgba(7,9,12,0.72) 82%, rgba(7,9,12,0.92) 100%)",
        }}
      />

      {/* Soft Radial Edge Vignette (ensures perimeter contrast and card legibility) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 45%, transparent 48%, rgba(4,6,8,0.45) 100%)",
        }}
      />
    </div>
  );
}
