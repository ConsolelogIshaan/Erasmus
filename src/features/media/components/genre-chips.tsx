"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { mediaHref } from "@/lib/media/routes";
import type { Genre } from "@/types/media";
import { cn } from "@/lib/utils";

interface GenreChipsProps {
  genres: Genre[];
  className?: string;
}

/**
 * Horizontally scrollable genre chips.
 * Extra vertical padding keeps hover lift from clipping.
 */
export function GenreChips({ genres, className }: GenreChipsProps) {
  if (!genres.length) return null;

  return (
    <section className={cn("space-y-3", className)} aria-label="Browse by genre">
      <div className="flex items-end justify-between gap-3 px-2 sm:px-3">
        <h2 className="text-section-title">Browse by Genre</h2>
        <Link
          href="/genres"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>
      {/*
        overflow-x-auto clips the cross-axis; pad so hover translate stays visible.
      */}
      <div className="scrollbar-thin flex gap-2.5 overflow-x-auto px-2 sm:px-3 py-2">
        {genres.map((g) => (
          <Link
            key={g.id}
            href={mediaHref("genre", g.id)}
            className="shrink-0 transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Badge
              variant="muted"
              className="h-10 cursor-pointer rounded-xl border-0 bg-muted/45 px-5 text-[15px] font-semibold text-foreground backdrop-blur-md ring-1 ring-border/40 transition-colors hover:bg-muted/70 dark:bg-white/[0.08] dark:ring-white/10 dark:hover:bg-white/[0.14]"
            >
              {g.name}
            </Badge>
          </Link>
        ))}
      </div>
    </section>
  );
}
