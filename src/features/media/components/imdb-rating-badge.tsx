"use client";

import * as React from "react";
import { fetchClientImdbRating } from "@/lib/media/client-imdb-ratings";
import { cn } from "@/lib/utils";

export function ImdbRatingBadge({ mediaType, id, rating, className }: {
  mediaType: "movie" | "tv";
  id: string;
  rating?: number | null;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [result, setResult] = React.useState<{ key: string; value: number | null } | null>(null);
  const key = `${mediaType}:${id}`;
  const value = rating ?? (result?.key === key ? result.value : null);
  React.useEffect(() => {
    if (rating != null || !ref.current) return;
    let cancelled = false;
    const load = () => {
      void fetchClientImdbRating(mediaType, id).then((value) => {
        if (!cancelled) setResult({ key: `${mediaType}:${id}`, value });
      });
    };
    if (typeof IntersectionObserver === "undefined") { load(); return () => { cancelled = true; }; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); }
    });
    observer.observe(ref.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [mediaType, id, rating]);
  const valid = value != null && Number.isFinite(value) && value > 0 && value <= 10;
  return (
    <span ref={ref} className={cn("pointer-events-none inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm", className)}
      aria-label={valid ? `IMDb rating ${value.toFixed(1)} out of 10` : "IMDb rating unavailable"}>
      <span className="tabular-nums">{valid ? value.toFixed(1) : "—"}</span>
    </span>
  );
}
