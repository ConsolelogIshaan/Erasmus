import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/media/format";
import type { MediaRating } from "@/types/media";

interface RatingsDisplayProps {
  ratings: MediaRating[];
  className?: string;
  compact?: boolean;
}

function formatValue(rating: MediaRating): string | null {
  if (rating.value == null) return null;
  if (rating.scale === 100) return `${Math.round(rating.value)}%`;
  return rating.value.toFixed(1);
}

/**
 * Authentic Rotten Tomatoes Fresh Tomato SVG
 */
function TomatoIcon({ score }: { score: number | null }) {
  const isRotten = score != null && score < 60;

  if (isRotten) {
    // Green splat for rotten (< 60%)
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" aria-hidden="true">
        <path
          d="M12 3C8 3 4 7 3 11C2 15 5 18 8 20C11 22 17 21 20 18C22 15 21 10 19 7C17 4 14 3 12 3Z"
          fill="#85B242"
        />
        <circle cx="10" cy="11" r="1.5" fill="#4B661F" />
        <circle cx="15" cy="13" r="1.2" fill="#4B661F" />
      </svg>
    );
  }

  // Classic Fresh Red Tomato
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" aria-hidden="true">
      {/* Tomato body */}
      <path
        d="M12 4.2C7.8 4.2 3.5 7.2 3.5 13.8C3.5 19.2 8.5 21.8 12 21.8C15.5 21.8 20.5 19.2 20.5 13.8C20.5 7.2 16.2 4.2 12 4.2Z"
        fill="#FA320A"
      />
      {/* Subtle shine */}
      <path
        d="M7.5 10C6.5 12 6.5 14.5 7.2 16"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Green calyx & leaves */}
      <path
        d="M12 5.2C12.2 3.6 13.2 2.2 14.2 2C13.5 3 13.2 4.2 13 5C14.6 4.3 16.5 4.3 17.5 4.8C16.2 5.6 14.6 6 13.2 6.2C14.4 7.4 15.4 9 15.6 10.2C14.3 9.2 13.1 8 12.2 7C11.4 8 10.1 9.2 8.8 10.2C9 9 10 7.4 11.2 6.2C9.8 6 8.2 5.6 6.9 4.8C7.9 4.3 9.8 4.3 11.4 5C11.2 4.2 10.9 3 10.2 2C11.2 2.2 12.2 3.6 12 5.2Z"
        fill="#469435"
      />
    </svg>
  );
}

/**
 * Authentic IMDb Classic Yellow Badge
 */
function ImdbBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-[3px] bg-[#F5C518] px-1.5 py-0.5 text-[10px] font-black leading-none tracking-tight text-black shadow-sm select-none">
      IMDb
    </span>
  );
}

/**
 * Visually minimal, classic cinema ratings display:
 * Shows ONLY IMDb and Rotten Tomatoes in sleek, understated glass pills.
 */
export function RatingsDisplay({ ratings, className, compact }: RatingsDisplayProps) {
  // Only keep IMDb and Rotten Tomatoes as requested
  const allowed = ["imdb", "rotten_tomatoes"] as const;

  const sorted = [...ratings]
    .filter((r) => allowed.includes(r.provider as (typeof allowed)[number]) && r.value != null)
    .sort((a, b) => {
      const ai = allowed.indexOf(a.provider as (typeof allowed)[number]);
      const bi = allowed.indexOf(b.provider as (typeof allowed)[number]);
      return ai - bi;
    });

  if (!sorted.length) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 sm:gap-2.5", className)}
      role="list"
      aria-label="Movie ratings"
    >
      {sorted.map((rating) => {
        const display = formatValue(rating);
        if (!display) return null;

        const isImdb = rating.provider === "imdb";
        const isRt = rating.provider === "rotten_tomatoes";

        const content = (
          <>
            {isImdb && (
              <>
                <ImdbBadge />
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-[#F5C518] text-[#F5C518]" aria-hidden="true" />
                  <span className={cn("font-bold text-white tabular-nums", compact ? "text-xs" : "text-sm")}>
                    {display}
                  </span>
                  <span className="text-[11px] text-white/50 font-normal">/10</span>
                </div>
                {rating.count != null && rating.count > 0 && (
                  <span className="text-[11px] text-white/40 hidden md:inline font-normal">
                    ({formatCount(rating.count)})
                  </span>
                )}
              </>
            )}

            {isRt && (
              <>
                <TomatoIcon score={rating.value} />
                <span className={cn("font-bold text-white tabular-nums", compact ? "text-xs" : "text-sm")}>
                  {display}
                </span>
                <span className="text-[11px] text-white/60 font-medium tracking-wide">
                  Tomatometer
                </span>
              </>
            )}
          </>
        );

        const pillClasses = cn(
          "inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-md",
          "border border-white/10 text-white transition-all duration-200",
          rating.url
            ? "hover:bg-black/60 hover:border-white/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            : "hover:bg-black/50 hover:border-white/15",
          compact && "px-2.5 py-1 gap-1.5",
        );

        return rating.url ? (
          <a
            key={rating.provider}
            href={rating.url}
            target="_blank"
            rel="noreferrer"
            role="listitem"
            className={pillClasses}
          >
            {content}
          </a>
        ) : (
          <div key={rating.provider} role="listitem" className={pillClasses}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
