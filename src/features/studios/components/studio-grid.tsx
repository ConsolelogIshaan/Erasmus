"use client";

import { Film } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PosterCard } from "@/features/media/components/poster-card";
import type { MediaSummary } from "@/types/media";

export function StudioGrid({ items, page }: { items: MediaSummary[]; page: number }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={Film}
        title={
          page > 1
            ? "No confirmed titles on this page"
            : "No titles listed in this region"
        }
        description={
          page > 1
            ? "Return to an earlier page or adjust your filters."
            : "Try another country or switch between movies and TV shows. This service may not have a catalog listed here."
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-10 px-3 py-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item, index) => (
        <PosterCard
          key={`${item.mediaType}-${item.id}`}
          item={item}
          className="w-full! min-w-0"
          priority={index < 6}
          hoverEffect="none"
        />
      ))}
    </div>
  );
}
