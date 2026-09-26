"use client";

import * as React from "react";
import { Compass, Film, Home, Search, Tv } from "lucide-react";

import { AdaptiveLiquidGlass } from "@/components/ui/adaptive-liquid-glass";
import { cn } from "@/lib/utils";

/**
 * Reference implementation: a floating pill navigation bar using
 * AdaptiveLiquidGlass. Not wired into the app shell — this is a
 * demonstration of the component's intended usage (e.g. a future top nav),
 * matching the "ShuttleTV" style adaptive glass pill described in the spec.
 *
 * Links/icons render in the `children` slot and stay perfectly sharp in a
 * `relative z-10` layer, while whatever scrolls behind the pill (posters,
 * backdrops) is optically bent and illuminated through the glass.
 */
const NAV_ITEMS = [
  { label: "Home", icon: Home },
  { label: "Discover", icon: Compass },
  { label: "Movies", icon: Film },
  { label: "TV Shows", icon: Tv },
] as const;

export function AdaptiveLiquidGlassNavExample({ className }: { className?: string }) {
  return (
    <AdaptiveLiquidGlass
      className={cn(
        "flex items-center gap-1 rounded-full px-2 py-2",
        className,
      )}
      radius="9999px"
      displacementScale={160}
      tintOpacity={0.2}
    >
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white/90",
              "transition-colors duration-200 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
        <button
          type="button"
          aria-label="Search"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full text-white/90",
            "transition-colors duration-200 hover:bg-white/10 hover:text-white",
          )}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </AdaptiveLiquidGlass>
  );
}
