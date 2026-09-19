"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bookmark, Loader2, Play, Star } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { posterUrl } from "@/lib/media/image";
import { formatNumber, formatVote, formatYear } from "@/lib/media/format";
import { mediaHref } from "@/lib/media/routes";
import { actionUpsertAndSetStatus } from "@/features/library/actions/library-actions";
import { StreamingTheaterModal } from "@/features/streaming/components/streaming-theater-modal";
import { getTvShowResume } from "@/lib/streaming/playback-progress";
import type { MediaSummary } from "@/types/media";
import type { MediaIdentity, WatchStatus } from "@/types/library";

interface PosterCardProps {
  item: MediaSummary;
  className?: string;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
  /** Show Plan / Watching / Completed on hover (default true). */
  quickActions?: boolean;
  /** Position in a ranked shelf. Takes the audience-score badge's corner. */
  rank?: number;
  /** IMDb score for ranked shelves — shown instead of the TMDB star. */
  imdbRating?: number | null;
  /** IMDb vote count, shown in the caption in place of the media type. */
  imdbVotes?: number | null;
}

const sizeClass = {
  sm: "w-32 sm:w-36",
  md: "w-44 sm:w-48 lg:w-52 xl:w-56",
  lg: "w-52 sm:w-60 lg:w-64",
};

type QuickStatus = "plan_to_watch" | "watching" | "completed";

const STATUS_TOAST: Record<QuickStatus, (title: string) => string> = {
  plan_to_watch: (title) => `Added “${title}” to Plan to Watch`,
  watching: (title) => `Added “${title}” to Watching`,
  completed: (title) => `Marked “${title}” as Completed`,
};

const STATUS_BADGE: Record<QuickStatus, string> = {
  plan_to_watch: "Plan",
  watching: "Watching",
  completed: "Done",
};

/** Height and styling for hover action buttons */
const actionBtnClass =
  "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold backdrop-blur-xl transition-all duration-200 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50";

/** Smooth settle — no snappy bounce that fights the layout. */
const popTransition = {
  type: "spring" as const,
  stiffness: 260,
  damping: 30,
  mass: 0.9,
};

function toIdentity(item: MediaSummary): MediaIdentity {
  return {
    provider: "tmdb",
    mediaType: item.mediaType,
    externalId: item.id,
    title: item.title,
    originalTitle: item.originalTitle,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    releaseDate: item.releaseDate,
    overview: item.overview,
    originalLanguage: item.originalLanguage,
  };
}

/**
 * Catalog poster with smooth hover pop + translucent quick-list actions.
 */
export function PosterCard({
  item,
  className,
  priority,
  size = "md",
  quickActions = true,
  rank,
  imdbRating,
  imdbVotes,
}: PosterCardProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [loaded, setLoaded] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const [pending, setPending] = React.useState<WatchStatus | null>(null);
  const [lastStatus, setLastStatus] = React.useState<WatchStatus | null>(null);
  const [theaterOpen, setTheaterOpen] = React.useState(false);

  const tvResume = item.mediaType === "tv" ? getTvShowResume(String(item.id)) : null;
  const playSeason = tvResume?.season ?? 1;
  const playEpisode = tvResume?.episode ?? 1;

  const href = mediaHref(item.mediaType, item.id);
  const src = posterUrl(item.posterPath, "w500");
  const year = formatYear(item.releaseDate);
  const showActions = quickActions && hovered;

  const setStatus = async (status: WatchStatus, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;

    setPending(status);
    try {
      const res = await actionUpsertAndSetStatus(toIdentity(item), status);
      if (!res.success) {
        toast.error(res.error ?? "Could not update status");
        return;
      }
      setLastStatus(status);
      const toastFor = STATUS_TOAST[status as QuickStatus];
      toast.success(toastFor ? toastFor(item.title) : `Updated “${item.title}”`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(null);
    }
  };

  const motionTarget = reduceMotion
    ? { y: 0, scale: 1, zIndex: hovered ? 8 : 0 }
    : hovered
      ? { y: -12, scale: 1.12, zIndex: 40 }
      : { y: 0, scale: 1, zIndex: 0 };

  return (
    <motion.div
      className={cn(
        "group relative shrink-0 will-change-transform",
        sizeClass[size],
        className,
      )}
      style={{ transformOrigin: "50% 80%" }}
      animate={motionTarget}
      transition={reduceMotion ? { duration: 0.01 } : popTransition}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHovered(false);
        }
      }}
    >
      <div
        className={cn(
          "bg-muted relative aspect-[2/3] overflow-hidden rounded-xl shadow-md",
          "transition-shadow duration-500 ease-out",
          hovered && "shadow-2xl ring-1 shadow-black/50 ring-white/10",
        )}
      >
        <Link
          href={href}
          prefetch
          className="focus-visible:ring-ring absolute inset-0 z-0 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          aria-label={`${rank != null ? `#${rank} ` : ""}${item.title}${
            year ? `, ${year}` : ""
          }${imdbRating != null ? `, IMDb ${imdbRating.toFixed(1)}` : ""}`}
        >
          {src ? (
            <>
              {!loaded ? (
                <div className="skeleton-shimmer absolute inset-0" aria-hidden />
              ) : null}
              <Image
                src={src}
                alt=""
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 208px, 224px"
                className={cn(
                  "object-cover transition-[transform,opacity] duration-500 ease-out",
                  hovered && "scale-[1.02]",
                  loaded ? "opacity-100" : "opacity-0",
                )}
                priority={priority}
                onLoad={() => setLoaded(true)}
              />
            </>
          ) : (
            <div className="bg-muted text-muted-foreground flex h-full items-center justify-center p-3 text-center text-xs">
              {item.title}
            </div>
          )}
        </Link>

        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[55%] bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-400 ease-out",
            hovered ? "opacity-100" : "opacity-0",
          )}
        />

        {rank != null ? (
          <span className="pointer-events-none absolute top-0 left-0 z-[1] rounded-br-lg bg-black/80 px-2 py-1 font-mono text-xs font-semibold text-white tabular-nums backdrop-blur-sm">
            {rank}
          </span>
        ) : item.voteAverage != null && item.voteAverage > 0 ? (
          <div className="pointer-events-none absolute top-2 left-2 z-[1] inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <Star className="fill-primary text-primary h-3 w-3" aria-hidden="true" />
            {formatVote(item.voteAverage)}
          </div>
        ) : null}

        {/* Steps aside for the quick actions, which claim the same corner on hover */}
        {imdbRating != null ? (
          <span
            className={cn(
              "pointer-events-none absolute bottom-1.5 left-1.5 z-[1] inline-flex items-center",
              "gap-1 rounded bg-[#f5c518] px-1.5 py-0.5 text-[10px] font-bold text-black",
              "transition-opacity duration-200 ease-out",
              showActions ? "opacity-0" : "opacity-100",
            )}
          >
            IMDb {imdbRating.toFixed(1)}
          </span>
        ) : null}

        <AnimatePresence>
          {lastStatus && lastStatus in STATUS_BADGE ? (
            <motion.div
              key="status-badge"
              initial={
                reduceMotion ? { opacity: 1 } : { opacity: 0, transform: "scale(0.92)" }
              }
              animate={{ opacity: 1, transform: "scale(1)" }}
              exit={
                reduceMotion ? { opacity: 0 } : { opacity: 0, transform: "scale(0.96)" }
              }
              transition={{
                duration: reduceMotion ? 0.01 : 0.18,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="pointer-events-none absolute top-2 right-2 z-[1] rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
            >
              {STATUS_BADGE[lastStatus as QuickStatus]}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {showActions ? (
            <motion.div
              key="quick-actions"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 p-2.5"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void actionUpsertAndSetStatus(toIdentity(item), "watching").catch(() => {});
                  setTheaterOpen(true);
                }}
                className={cn(
                  actionBtnClass,
                  "bg-white/75 text-black border border-white/60 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.85)] hover:bg-white/90 active:scale-[0.97]",
                )}
                aria-label={`Play ${item.title}`}
              >
                <Play className="h-3.5 w-3.5 fill-black text-black ml-0.5" />
                Play
              </button>
              <button
                type="button"
                disabled={pending != null}
                onClick={(e) => void setStatus("plan_to_watch", e)}
                className={cn(
                  actionBtnClass,
                  "bg-black/50 text-white border border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_1px_rgba(255,255,255,0.15)] hover:bg-black/70 active:scale-[0.97]",
                )}
                aria-label={`Add ${item.title} to plan to watch`}
              >
                {pending === "plan_to_watch" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Bookmark className="h-3.5 w-3.5" />
                )}
                Plan to Watch
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Link href={href} prefetch className="mt-2.5 block space-y-1 px-0.5">
        <p className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight">
          {item.title}
        </p>
        <p className="text-muted-foreground text-[13px]">
          {year ?? "—"}
          <span className="mx-1 opacity-40">·</span>
          {imdbVotes
            ? `${formatNumber(imdbVotes)} votes`
            : item.mediaType === "tv"
              ? "TV"
              : "Movie"}
        </p>
      </Link>

      {theaterOpen ? (
        <StreamingTheaterModal
          open={theaterOpen}
          onOpenChange={setTheaterOpen}
          title={item.title}
          tmdbId={String(item.id)}
          mediaType={item.mediaType}
          identity={toIdentity(item)}
          currentSeason={item.mediaType === "tv" ? playSeason : undefined}
          currentEpisode={item.mediaType === "tv" ? playEpisode : undefined}
        />
      ) : null}
    </motion.div>
  );
}
