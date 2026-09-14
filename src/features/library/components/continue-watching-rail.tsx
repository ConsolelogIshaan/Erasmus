"use client";

import * as React from "react";
import { Library } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryPosterCard } from "@/features/library/components/library-poster-card";
import {
  getRecentPlayback,
  clearRecentPlaybackItem,
  clearTvShowResume,
} from "@/lib/streaming/playback-progress";
import { actionRemoveFromLibrary } from "@/features/library/actions/library-actions";
import { toast } from "sonner";
import type { LibraryEntry } from "@/types/library";

interface ContinueWatchingRailProps {
  initialEntries: LibraryEntry[];
}

export function ContinueWatchingRail({ initialEntries }: ContinueWatchingRailProps) {
  const [entries, setEntries] = React.useState<LibraryEntry[]>(initialEntries);

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
    const recent = getRecentPlayback();
    if (!recent.length) {
      setEntries(initialEntries);
      return;
    }

    const map = new Map<string, LibraryEntry>();
    for (const entry of initialEntries) {
      map.set(`${entry.media_type}:${entry.external_id}`, { ...entry });
    }

    for (const item of recent) {
      const key = `${item.mediaType}:${item.tmdbId}`;
      const existing = map.get(key);
      const progressPercent =
        item.duration && item.duration > 0
          ? Math.min(100, Math.round((item.seconds / item.duration) * 100))
          : existing?.progress_percent ?? 0;

      if (existing) {
        existing.status = "watching";
        existing.last_watched_at = new Date(item.updatedAt).toISOString();
        existing.progress_percent = progressPercent;
        if (item.posterPath && !existing.poster_path) {
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
          backdrop_path: item.backdropPath ?? null,
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

    const displayList = merged.slice(0, 8);
    setEntries(displayList);

    // Auto-heal missing posters and fix episode titles to show titles
    const missing = displayList.filter((e) => !e.poster_path || (e.title && e.title.includes(",")));
    if (missing.length > 0) {
      Promise.all(
        missing.map(async (entry) => {
          try {
            const res = await fetch(`/api/media/details?type=${entry.media_type}&id=${entry.external_id}&_v=2`);
            if (!res.ok) return null;
            const data = await res.json();
            return {
              id: entry.id,
              tmdbId: entry.external_id,
              mediaType: entry.media_type,
              posterPath: data.posterPath || null,
              backdropPath: data.backdropPath || null,
              title: data.title || null,
            };
          } catch {
            return null;
          }
        })
      ).then((resolved) => {
        let updated = false;
        const currentRecent = getRecentPlayback();
        const nextEntries = displayList.map((e) => {
          const r = resolved.find((item) => item && item.id === e.id);
          if (r && (r.posterPath || r.title)) {
            updated = true;
            const fixedTitle = (r.title && (e.title.includes(",") || e.title.length > 35)) ? r.title : (e.title || r.title);
            // Persist back to localStorage
            const rec = currentRecent.find((x) => x.tmdbId === e.external_id && x.mediaType === e.media_type);
            if (rec) {
              if (r.posterPath) rec.posterPath = r.posterPath;
              if (r.backdropPath) rec.backdropPath = r.backdropPath;
              if (r.title && (rec.title.includes(",") || rec.title.length > 35)) rec.title = r.title;
            }
            return {
              ...e,
              poster_path: r.posterPath ?? e.poster_path,
              backdrop_path: r.backdropPath ?? e.backdrop_path,
              title: fixedTitle,
            };
          }
          return e;
        });

        if (updated) {
          try {
            localStorage.setItem("argus:playback:recent", JSON.stringify(currentRecent));
          } catch {}
          setEntries(nextEntries);
        }
      });
    }
  }, [initialEntries]);

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Library}
        title="Nothing in progress"
        description="Mark a title as Watching or start playing to see it here."
        className="py-10"
      />
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
