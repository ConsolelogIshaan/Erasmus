"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Heart, Pin, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { posterUrl } from "@/lib/media/image";
import { Badge } from "@/components/ui/badge";
import { WATCH_STATUS_LABELS, type LibraryEntry } from "@/types/library";
import { ROUTES } from "@/constants/routes";
import { springSoft } from "@/animations/motion";
import {
  getPlaybackProgress,
  getTvShowResume,
  formatTimecode,
} from "@/lib/streaming/playback-progress";
import { StreamingTheaterModal } from "@/features/streaming/components/streaming-theater-modal";

interface LibraryPosterCardProps {
  entry: LibraryEntry;
  className?: string;
  showProgress?: boolean;
}

/**
 * Library poster card — subtle lift on hover, interactive resume button,
 * and live season/episode & progress tracking.
 */
export function LibraryPosterCard({
  entry,
  className,
  showProgress = true,
}: LibraryPosterCardProps) {
  const reduceMotion = useReducedMotion();
  const [theaterOpen, setTheaterOpen] = React.useState(false);
  const [localProgress, setLocalProgress] = React.useState<number | null>(null);
  const [episodeLabel, setEpisodeLabel] = React.useState<string | null>(null);
  const [playSeason, setPlaySeason] = React.useState<number | undefined>(
    entry.current_season ?? undefined,
  );
  const [playEpisode, setPlayEpisode] = React.useState<number | undefined>(
    entry.current_episode ?? undefined,
  );

  React.useEffect(() => {
    if (entry.media_type === "tv") {
      const tvResume = getTvShowResume(entry.external_id);
      const s = tvResume?.season ?? entry.current_season ?? 1;
      const ep = tvResume?.episode ?? entry.current_episode ?? 1;
      setPlaySeason(s);
      setPlayEpisode(ep);
      setEpisodeLabel(`S${s} · E${ep}`);

      if (tvResume && tvResume.duration && tvResume.duration > 0) {
        const pct = Math.min(100, Math.round((tvResume.seconds / tvResume.duration) * 100));
        setLocalProgress(pct);
      } else {
        const epProg = getPlaybackProgress({
          mediaType: "tv",
          tmdbId: entry.external_id,
          season: s,
          episode: ep,
        });
        if (epProg && epProg.duration && epProg.duration > 0) {
          const pct = Math.min(100, Math.round((epProg.seconds / epProg.duration) * 100));
          setLocalProgress(pct);
        }
      }
    } else {
      const movieProg = getPlaybackProgress({
        mediaType: "movie",
        tmdbId: entry.external_id,
      });
      if (movieProg && movieProg.duration && movieProg.duration > 0) {
        const pct = Math.min(100, Math.round((movieProg.seconds / movieProg.duration) * 100));
        setLocalProgress(pct);
      }
    }
  }, [entry.external_id, entry.media_type, entry.current_season, entry.current_episode]);

  const href =
    entry.media_type === "movie"
      ? ROUTES.movie(entry.external_id)
      : ROUTES.show(entry.external_id);
  const src = posterUrl(entry.poster_path, "w342");
  const progress = localProgress ?? Math.min(100, Math.max(0, entry.progress_percent ?? 0));

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setTheaterOpen(true);
  };

  const badgeText =
    entry.status === "watching" && episodeLabel
      ? episodeLabel
      : WATCH_STATUS_LABELS[entry.status] ?? entry.status;

  return (
    <>
      <motion.div
        className={cn("group relative z-0 w-full will-change-transform", className)}
        style={{ transformOrigin: "50% 70%" }}
        whileHover={
          reduceMotion
            ? undefined
            : { y: -6, scale: 1.04, zIndex: 5, transition: springSoft }
        }
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      >
        <Link
          href={href}
          prefetch
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={entry.title}
        >
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-transparent bg-muted shadow-md transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/50">
            {src ? (
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 33vw, 160px"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                {entry.title}
              </div>
            )}

            {/* Dark overlay on hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none" />

            {/* Centered Play / Resume button */}
            <button
              type="button"
              onClick={handlePlay}
              className="absolute inset-0 m-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:scale-110 active:scale-95 z-20 pointer-events-none group-hover:pointer-events-auto"
              aria-label={`Resume ${entry.title}`}
              title={`Resume ${entry.title}`}
            >
              <Play className="h-5 w-5 fill-current ml-0.5" />
            </button>

            <div className="absolute left-1.5 top-1.5 flex flex-col gap-1 z-10">
              {entry.is_favorite ? (
                <span className="inline-flex rounded-md bg-black/65 p-1 text-primary backdrop-blur-sm">
                  <Heart className="h-3 w-3 fill-current" aria-label="Favorite" />
                </span>
              ) : null}
              {entry.is_pinned ? (
                <span className="inline-flex rounded-md bg-black/65 p-1 text-white backdrop-blur-sm">
                  <Pin className="h-3 w-3" aria-label="Pinned" />
                </span>
              ) : null}
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-8 z-10">
              <Badge
                variant="secondary"
                className="mb-1 h-5 max-w-full truncate px-1.5 text-[10px]"
              >
                {badgeText}
              </Badge>
              {showProgress && progress > 0 && progress < 100 ? (
                <div className="h-1 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-2 line-clamp-2 px-0.5 text-sm font-medium leading-snug">
            {entry.title}
          </p>
        </Link>
      </motion.div>

      {theaterOpen ? (
        <StreamingTheaterModal
          open={theaterOpen}
          onOpenChange={setTheaterOpen}
          title={entry.title}
          tmdbId={entry.external_id}
          mediaType={entry.media_type}
          currentSeason={playSeason}
          currentEpisode={playEpisode}
          identity={{
            provider: entry.provider ?? "tmdb",
            mediaType: entry.media_type,
            externalId: entry.external_id,
            title: entry.title,
            posterPath: entry.poster_path,
            releaseDate: entry.release_date,
          }}
        />
      ) : null}
    </>
  );
}
