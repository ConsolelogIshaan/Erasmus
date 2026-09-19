"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Heart, Pin, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { posterUrl, backdropUrl } from "@/lib/media/image";
import { Badge } from "@/components/ui/badge";
import { WATCH_STATUS_LABELS, type LibraryEntry } from "@/types/library";
import { ROUTES } from "@/constants/routes";
import { springSoft } from "@/animations/motion";
import {
  getPlaybackProgress,
  getTvShowResume,
} from "@/lib/streaming/playback-progress";
import {
  getCachedBackdrop,
  getCachedMediaItem,
  setCachedBackdrop,
} from "@/lib/media/backdrop-cache";

interface LibraryPosterCardProps {
  entry: LibraryEntry;
  className?: string;
  showProgress?: boolean;
  orientation?: "portrait" | "landscape";
  onRemove?: (entry: LibraryEntry) => void;
}

/**
 * Library poster card — supports portrait (2:3) or landscape (16:9) formats,
 * subtle lift on hover, and live season/episode tracking.
 */
export function LibraryPosterCard({
  entry,
  className,
  showProgress = true,
  orientation = "portrait",
  onRemove,
}: LibraryPosterCardProps) {
  const reduceMotion = useReducedMotion();
  const [localProgress, setLocalProgress] = React.useState<number | null>(null);
  const [episodeLabel, setEpisodeLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (entry.media_type === "tv") {
      const tvResume = getTvShowResume(entry.external_id);
      const s = tvResume?.season ?? entry.current_season ?? 1;
      const ep = tvResume?.episode ?? entry.current_episode ?? 1;
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

  // Synchronously initialize from persistent backdrop cache on frame zero (~0ms)
  const [resolvedPoster, setResolvedPoster] = React.useState<string | null>(() => {
    const verified = getCachedMediaItem(entry.media_type, entry.external_id);
    return verified?.posterPath ?? entry.poster_path ?? null;
  });
  const [resolvedBackdrop, setResolvedBackdrop] = React.useState<string | null>(() => {
    const verified = getCachedBackdrop(entry.media_type, entry.external_id);
    return verified ?? entry.backdrop_path ?? null;
  });
  const [displayTitle, setDisplayTitle] = React.useState<string>(() => {
    const verified = getCachedMediaItem(entry.media_type, entry.external_id);
    return verified?.title ?? entry.title;
  });

  React.useEffect(() => {
    const verified = getCachedMediaItem(entry.media_type, entry.external_id);
    if (verified?.backdropPath) {
      setResolvedBackdrop(verified.backdropPath);
    } else if (entry.backdrop_path) {
      setResolvedBackdrop(entry.backdrop_path);
    }
    if (verified?.posterPath) {
      setResolvedPoster(verified.posterPath);
    } else if (entry.poster_path) {
      setResolvedPoster(entry.poster_path);
    }
    if (verified?.title) {
      setDisplayTitle(verified.title);
    } else if (entry.title) {
      setDisplayTitle(entry.title);
    }
  }, [entry.external_id, entry.media_type, entry.backdrop_path, entry.poster_path, entry.title]);

  React.useEffect(() => {
    if (!entry.external_id) return;

    let cancelled = false;
    fetch(`/api/media/details?type=${entry.media_type}&id=${entry.external_id}&_cb=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const bestBackdrop = data.enBackdropPath || data.logoBackdropPath || data.backdropPath;
        if (bestBackdrop) {
          setResolvedBackdrop(bestBackdrop);
          if (data.enBackdropPath || data.logoBackdropPath) {
            setCachedBackdrop(entry.media_type, entry.external_id, {
              backdropPath: bestBackdrop,
              posterPath: data.posterPath,
              title: data.title,
            });
          }
        }
        if (data.posterPath) setResolvedPoster(data.posterPath);
        if (data.title && (entry.title.includes(",") || entry.title.length > 35)) {
          setDisplayTitle(data.title);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entry.external_id, entry.media_type, entry.title]);

  const href =
    entry.media_type === "movie"
      ? ROUTES.movie(entry.external_id)
      : ROUTES.show(entry.external_id);

  const isLandscape = orientation === "landscape";
  const backdropImg = backdropUrl(resolvedBackdrop ?? entry.backdrop_path, "w780");
  const posterImg = posterUrl(resolvedPoster ?? entry.poster_path, "w500");
  const src = isLandscape ? (backdropImg ?? posterImg) : posterImg;

  const progress = localProgress ?? Math.min(100, Math.max(0, entry.progress_percent ?? 0));

  const badgeText =
    entry.status === "watching" && episodeLabel
      ? episodeLabel
      : WATCH_STATUS_LABELS[entry.status] ?? entry.status;

  const subtitle = React.useMemo(() => {
    if (entry.media_type === "tv") {
      return episodeLabel
        ? progress > 0
          ? `${episodeLabel} · ${progress}% watched`
          : episodeLabel
        : progress > 0
          ? `TV Series · ${progress}% watched`
          : "TV Series";
    }
    if (entry.runtime_minutes && entry.movie_progress_minutes) {
      const left = Math.max(1, entry.runtime_minutes - entry.movie_progress_minutes);
      return `${left}m left · ${progress}% watched`;
    }
    return progress > 0 ? `${progress}% watched` : (entry.release_date?.slice(0, 4) ?? "Movie");
  }, [entry.media_type, episodeLabel, progress, entry.runtime_minutes, entry.movie_progress_minutes, entry.release_date]);

  return (
    <>
      <motion.div
        className={cn("group relative z-0 w-full will-change-transform", className)}
        style={{ transformOrigin: "50% 70%" }}
        whileHover={
          reduceMotion
            ? undefined
            : { y: -5, scale: 1.03, zIndex: 5, transition: springSoft }
        }
        whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      >
        <Link
          href={href}
          prefetch
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={entry.title}
        >
          {isLandscape ? (
            /* Landscape 16:9 Card */
            <div className="relative aspect-video overflow-hidden rounded-xl border border-border/40 bg-muted shadow-md transition-all duration-300 group-hover:border-border/80 group-hover:shadow-xl group-hover:shadow-black/50">
              {src ? (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 80vw, (max-width: 1024px) 320px, 360px"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
                  {entry.title}
                </div>
              )}

              {/* Remove button */}
              {onRemove ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(entry);
                  }}
                  className="absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white/90 border border-white/20 backdrop-blur-md shadow-md transition-all duration-200 hover:bg-red-600 hover:border-red-600 hover:text-white hover:scale-110 active:scale-95 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 pointer-events-auto"
                  title={`Remove ${entry.title} from Continue Watching`}
                  aria-label={`Remove ${entry.title} from Continue Watching`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}

              {/* Top-left badges (favorite / pinned) */}
              <div className="absolute left-2 top-2 flex items-center gap-1 z-10">
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

              {/* Bottom gradient & status badge */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-2.5 pb-2 pt-6 z-10 flex items-center justify-between">
                <Badge
                  variant="secondary"
                  className="h-5 max-w-[80%] truncate px-1.5 text-[10px] bg-black/75 backdrop-blur-md border border-white/10 text-white shadow-sm"
                >
                  {badgeText}
                </Badge>
              </div>

              {/* Full-width bottom edge progress bar */}
              {showProgress && progress > 0 && progress < 100 ? (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60 z-20 overflow-hidden">
                  <div
                    className="h-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            /* Portrait 2:3 Card */
            <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-transparent bg-muted shadow-md transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/50">
              {src ? (
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 45vw, (max-width: 1024px) 208px, 224px"
                  className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                  {entry.title}
                </div>
              )}

              {/* Remove from Continue Watching button */}
              {onRemove ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemove(entry);
                  }}
                  className="absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white/90 border border-white/20 backdrop-blur-md shadow-md transition-all duration-200 hover:bg-red-600 hover:border-red-600 hover:text-white hover:scale-110 active:scale-95 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 pointer-events-auto"
                  title={`Remove ${entry.title} from Continue Watching`}
                  aria-label={`Remove ${entry.title} from Continue Watching`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}

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
          )}

          {/* Card Label */}
          {isLandscape ? (
            <div className="mt-2.5 px-0.5 space-y-0.5">
              <p className="truncate text-sm font-semibold leading-snug group-hover:text-primary transition-colors">
                {displayTitle || entry.title}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {subtitle}
              </p>
            </div>
          ) : (
            <p className="mt-2 line-clamp-2 px-0.5 text-sm font-medium leading-snug">
              {displayTitle || entry.title}
            </p>
          )}
        </Link>
      </motion.div>
    </>
  );
}
