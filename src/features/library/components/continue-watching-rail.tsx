"use client";

import * as React from "react";
import { Library } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LibraryPosterCard } from "@/features/library/components/library-poster-card";
import { getRecentPlayback, type RecentPlaybackItem } from "@/lib/streaming/playback-progress";
import type { LibraryEntry } from "@/types/library";

interface ContinueWatchingRailProps {
  initialEntries: LibraryEntry[];
}

export function ContinueWatchingRail({ initialEntries }: ContinueWatchingRailProps) {
  const [entries, setEntries] = React.useState<LibraryEntry[]>(initialEntries);

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

    setEntries(merged.slice(0, 8));
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
    <div className="grid grid-cols-3 gap-3 pt-4 sm:grid-cols-4">
      {entries.slice(0, 8).map((e) => (
        <LibraryPosterCard key={e.id} entry={e} />
      ))}
    </div>
  );
}
