"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Library } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryPosterCard } from "@/features/library/components/library-poster-card";
import { Button } from "@/components/ui/button";
import {
  getRecentPlayback,
  clearRecentPlaybackItem,
  clearTvShowResume,
} from "@/lib/streaming/playback-progress";
import {
  actionRemoveFromLibrary,
  actionGetContinueWatching,
} from "@/features/library/actions/library-actions";
import {
  getCachedBackdrop,
  setCachedBackdrop,
} from "@/lib/media/backdrop-cache";
import { cn } from "@/lib/utils";
import type { LibraryEntry } from "@/types/library";

interface ContinueWatchingRailProps {
  initialEntries?: LibraryEntry[];
  variant?: "grid" | "row";
  cardOrientation?: "portrait" | "landscape";
  title?: string;
  href?: string;
  className?: string;
}

export function ContinueWatchingRail({
  initialEntries = [],
  variant = "grid",
  cardOrientation,
  title = "Continue watching",
  href,
  className,
}: ContinueWatchingRailProps) {
  const effectiveOrientation = cardOrientation ?? (variant === "row" ? "landscape" : "portrait");

  // Synchronously initialize entries from recent playback storage on frame zero (~0ms)
  const [entries, setEntries] = React.useState<LibraryEntry[]>(() => {
    if (initialEntries.length > 0) return initialEntries;
    if (typeof window === "undefined") return [];
    try {
      const recent = getRecentPlayback();
      if (!recent.length) return [];
      return recent.slice(0, 16).map((item) => {
        const verifiedBackdrop = getCachedBackdrop(item.mediaType, item.tmdbId) || item.backdropPath;
        const progressPercent =
          item.duration && item.duration > 0
            ? Math.min(100, Math.round((item.seconds / item.duration) * 100))
            : 0;
        return {
          id: `recent-${item.mediaType}-${item.tmdbId}`,
          user_id: "",
          provider: "tmdb",
          media_type: item.mediaType,
          external_id: item.tmdbId,
          title: item.title,
          original_title: null,
          poster_path: item.posterPath ?? null,
          backdrop_path: verifiedBackdrop ?? null,
          release_date: null,
          overview: null,
          runtime_minutes: item.duration ? Math.round(item.duration / 60) : null,
          status: "watching" as const,
          is_favorite: false,
          is_hidden: false,
          is_pinned: false,
          is_archived: false,
          progress_percent: progressPercent,
          movie_progress_minutes: item.mediaType === "movie" ? Math.round(item.seconds / 60) : null,
          current_season: item.season ?? 1,
          current_episode: item.episode ?? 1,
          episodes_watched: item.episode ?? 1,
          total_episodes: null,
          started_at: new Date(item.updatedAt).toISOString(),
          completed_at: null,
          last_watched_at: new Date(item.updatedAt).toISOString(),
          rewatch_count: 0,
          user_rating: null,
          rating_scale: null,
          metadata: {},
          created_at: new Date(item.updatedAt).toISOString(),
          updated_at: new Date(item.updatedAt).toISOString(),
        };
      });
    } catch {
      return [];
    }
  });

  const scrollerRef = React.useRef<HTMLDivElement>(null);

  const scroll = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.min(el.clientWidth * 0.82, effectiveOrientation === "landscape" ? 640 : 540),
      behavior: "smooth",
    });
  };

  const handleRemove = React.useCallback((entry: LibraryEntry) => {
    // 1. Immediately remove from local rail state
    setEntries((prev) => prev.filter((item) => item.id !== entry.id));

    // 2. Clear from local recent playback storage
    clearRecentPlaybackItem(entry.external_id, entry.media_type);
    if (entry.media_type === "tv") {
      clearTvShowResume(entry.external_id);
    }

    // 3. Clear from server library if tracked
    actionRemoveFromLibrary({
      provider: entry.provider ?? "tmdb",
      mediaType: entry.media_type,
      externalId: entry.external_id,
      title: entry.title,
    }).catch(() => {});

    toast.success(`Removed “${entry.title}” from Continue Watching`);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function syncEntries() {
      const recent = getRecentPlayback();

      let baseEntries = initialEntries;

      if (!baseEntries.length) {
        try {
          const serverList = await actionGetContinueWatching(12);
          if (!cancelled && serverList.length > 0) {
            baseEntries = serverList;
          }
        } catch {
          // ignore error
        }
      }

      if (cancelled) return;

      if (!recent.length && !baseEntries.length) {
        setEntries([]);
        return;
      }

      const map = new Map<string, LibraryEntry>();
      for (const entry of baseEntries) {
        const verifiedBackdrop = getCachedBackdrop(entry.media_type, entry.external_id);
        map.set(`${entry.media_type}:${entry.external_id}`, {
          ...entry,
          backdrop_path: verifiedBackdrop || entry.backdrop_path,
        });
      }

      for (const item of recent) {
        const key = `${item.mediaType}:${item.tmdbId}`;
        const existing = map.get(key);
        const progressPercent =
          item.duration && item.duration > 0
            ? Math.min(100, Math.round((item.seconds / item.duration) * 100))
            : existing?.progress_percent ?? 0;

        const verifiedBackdrop = getCachedBackdrop(item.mediaType, item.tmdbId);
        const itemBackdrop = verifiedBackdrop || item.backdropPath;

        if (existing) {
          existing.status = "watching";
          existing.last_watched_at = new Date(item.updatedAt).toISOString();
          existing.progress_percent = progressPercent;
          if (itemBackdrop) {
            existing.backdrop_path = itemBackdrop;
          }
          if (item.posterPath) {
            existing.poster_path = item.posterPath;
          }
          if (item.mediaType === "tv") {
            existing.current_season = item.season ?? existing.current_season;
            existing.current_episode = item.episode ?? existing.current_episode;
          } else {
            existing.movie_progress_minutes = Math.round(item.seconds / 60);
          }
        } else if (item.title) {
          // Synthesize entry from local playback for immediate display
          const synthetic: LibraryEntry = {
            id: `recent-${item.mediaType}-${item.tmdbId}`,
            user_id: "",
            provider: "tmdb",
            media_type: item.mediaType,
            external_id: item.tmdbId,
            title: item.title,
            original_title: null,
            poster_path: item.posterPath ?? null,
            backdrop_path: itemBackdrop ?? null,
            release_date: null,
            overview: null,
            runtime_minutes: item.duration ? Math.round(item.duration / 60) : null,
            status: "watching",
            is_favorite: false,
            is_hidden: false,
            is_pinned: false,
            is_archived: false,
            progress_percent: progressPercent,
            movie_progress_minutes: item.mediaType === "movie" ? Math.round(item.seconds / 60) : null,
            current_season: item.season ?? 1,
            current_episode: item.episode ?? 1,
            episodes_watched: item.episode ?? 1,
            total_episodes: null,
            started_at: new Date(item.updatedAt).toISOString(),
            completed_at: null,
            last_watched_at: new Date(item.updatedAt).toISOString(),
            rewatch_count: 0,
            user_rating: null,
            rating_scale: null,
            metadata: {},
            created_at: new Date(item.updatedAt).toISOString(),
            updated_at: new Date(item.updatedAt).toISOString(),
          };
          map.set(key, synthetic);
        }
      }

      const merged = Array.from(map.values()).sort((a, b) => {
        const aTime = a.last_watched_at ? new Date(a.last_watched_at).getTime() : 0;
        const bTime = b.last_watched_at ? new Date(b.last_watched_at).getTime() : 0;
        return bTime - aTime;
      });

      const displayList = merged.slice(0, 16);
      for (const e of displayList) {
        const verified = getCachedBackdrop(e.media_type, e.external_id);
        if (verified) {
          e.backdrop_path = verified;
        }
      }
      setEntries(displayList);

      // Fetch authentic studio-titled details for all items to guarantee logo thumbnails
      if (displayList.length > 0) {
        Promise.all(
          displayList.map(async (entry) => {
            try {
              const res = await fetch(`/api/media/details?type=${entry.media_type}&id=${entry.external_id}&_cb=${Date.now()}`);
              if (!res.ok) return null;
              const data = await res.json();
              const bestBackdrop = data.enBackdropPath || data.logoBackdropPath || data.backdropPath || null;
              if (data.enBackdropPath || data.logoBackdropPath) {
                setCachedBackdrop(entry.media_type, entry.external_id, {
                  backdropPath: bestBackdrop!,
                  posterPath: data.posterPath || null,
                  title: data.title || null,
                });
              }
              return {
                id: entry.id,
                tmdbId: entry.external_id,
                mediaType: entry.media_type,
                posterPath: data.posterPath || null,
                backdropPath: bestBackdrop,
                title: data.title || null,
              };
            } catch {
              return null;
            }
          })
        ).then((resolved) => {
          if (cancelled) return;
          let updated = false;
          const currentRecent = getRecentPlayback();
          const nextEntries = displayList.map((e) => {
            const r = resolved.find((item) => item && (item.id === e.id || (String(item.tmdbId) === String(e.external_id) && item.mediaType === e.media_type)));
            if (r) {
              const newBackdrop = (effectiveOrientation === "landscape" && r.backdropPath) ? r.backdropPath : (r.backdropPath || e.backdrop_path);
              const newPoster = r.posterPath || e.poster_path;
              const fixedTitle = (r.title && (e.title.includes(",") || e.title.length > 35)) ? r.title : (e.title || r.title);

              if (newBackdrop !== e.backdrop_path || newPoster !== e.poster_path || fixedTitle !== e.title) {
                updated = true;
              }

              // Persist back to localStorage
              const rec = currentRecent.find((x) => String(x.tmdbId) === String(e.external_id) && x.mediaType === e.media_type);
              if (rec) {
                if (r.posterPath) rec.posterPath = r.posterPath;
                if (newBackdrop) rec.backdropPath = newBackdrop;
                if (r.title && (rec.title.includes(",") || rec.title.length > 35)) rec.title = r.title;
              }
              return {
                ...e,
                poster_path: newPoster,
                backdrop_path: newBackdrop,
                title: fixedTitle,
              };
            }
            return e;
          });

          if (updated) {
            try {
              localStorage.setItem("erasmus:playback:recent", JSON.stringify(currentRecent));
            } catch {}
            setEntries(nextEntries);
          }
        });
      }
    }

    void syncEntries();

    return () => {
      cancelled = true;
    };
  }, [initialEntries, effectiveOrientation]);

  if (entries.length === 0) {
    if (variant === "row") {
      return null;
    }
    return (
      <EmptyState
        icon={Library}
        title="Nothing in progress"
        description="Mark a title as Watching or start playing to see it here."
        className="py-10"
      />
    );
  }

  if (variant === "row") {
    return (
      <section className={cn("min-w-0 max-w-full space-y-3", className)} aria-label={title}>
        <div className="flex items-end justify-between gap-3 px-2 sm:px-3">
          <div>
            {href ? (
              <Link
                href={href}
                className="group inline-flex items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <h2 className="text-section-title transition-colors duration-300 group-hover:text-primary">
                  {title}
                </h2>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
              </Link>
            ) : (
              <h2 className="text-section-title">{title}</h2>
            )}
          </div>
          <div className="hidden items-center gap-1.5 sm:flex">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-xl"
              onClick={() => scroll(-1)}
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-xl"
              onClick={() => scroll(1)}
              aria-label={`Scroll ${title} right`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div
          ref={scrollerRef}
          className={cn(
            "scrollbar-thin flex gap-4 sm:gap-5 overflow-x-auto scroll-smooth px-2 sm:px-3 snap-x snap-mandatory scroll-px-2 sm:scroll-px-3",
            effectiveOrientation === "landscape" ? "py-5 sm:py-6" : "py-12"
          )}
          tabIndex={0}
          role="list"
        >
          {entries.slice(0, 16).map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "shrink-0 snap-start",
                effectiveOrientation === "landscape"
                  ? "w-64 sm:w-72 md:w-80 lg:w-[22rem]"
                  : "w-44 sm:w-48 lg:w-52 xl:w-56"
              )}
              role="listitem"
            >
              <LibraryPosterCard
                entry={entry}
                orientation={effectiveOrientation}
                onRemove={handleRemove}
              />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {entries.slice(0, 12).map((e) => (
        <LibraryPosterCard key={e.id} entry={e} onRemove={handleRemove} />
      ))}
    </div>
  );
}
