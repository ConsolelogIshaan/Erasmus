"use client";

import * as React from "react";
import { Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StreamingTheaterModal } from "./streaming-theater-modal";
import {
  formatTimecode,
  getPlaybackProgress,
  getTvShowResume,
  shouldResume,
} from "@/lib/streaming/playback-progress";
import type { MediaIdentity } from "@/types/library";
import { cn } from "@/lib/utils";

interface StreamButtonProps {
  title: string;
  tmdbId: string;
  mediaType: "movie" | "tv";
  identity?: MediaIdentity;
  season?: number;
  episode?: number;
  variant?: "hero" | "compact" | "icon" | "panel";
  className?: string;
}

export function StreamButton({
  title,
  tmdbId,
  mediaType,
  identity,
  season = 1,
  episode = 1,
  variant = "hero",
  className,
}: StreamButtonProps) {
  const [theaterOpen, setTheaterOpen] = React.useState(false);
  const [openToken, setOpenToken] = React.useState(0);
  const [resumeAt, setResumeAt] = React.useState<number | null>(null);
  const [playSeason, setPlaySeason] = React.useState(() => Math.max(1, season || 1));
  const [playEpisode, setPlayEpisode] = React.useState(() => Math.max(1, episode || 1));
  const [resumeDetail, setResumeDetail] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (theaterOpen) return;

    if (mediaType === "tv" && variant === "hero") {
      const tvResume = getTvShowResume(tmdbId);
      if (tvResume) {
        const s = tvResume.season;
        const e = tvResume.episode;
        setPlaySeason(s);
        setPlayEpisode(e);
        const saved = getPlaybackProgress({
          mediaType: "tv",
          tmdbId,
          season: s,
          episode: e,
        });
        const isResumable = shouldResume(saved);
        if (isResumable && saved && saved.seconds > 0) {
          setResumeAt(saved.seconds);
          setResumeDetail(`S${s}:E${e} · ${formatTimecode(saved.seconds)}`);
        } else if (saved && saved.seconds === 0) {
          setResumeAt(null);
          setResumeDetail(`S${s}:E${e}`);
        } else {
          setResumeAt(null);
          setResumeDetail(`S${s}:E${e}`);
        }
        return;
      }
    }

    const s = Math.max(1, season || 1);
    const e = Math.max(1, episode || 1);
    setPlaySeason(s);
    setPlayEpisode(e);
    const saved = getPlaybackProgress({
      mediaType,
      tmdbId,
      season: s,
      episode: e,
    });
    setResumeAt(shouldResume(saved) && saved ? saved.seconds : null);
    setResumeDetail(null);
  }, [theaterOpen, mediaType, tmdbId, season, episode, variant]);

  const openTheater = () => {
    setOpenToken((n) => n + 1);
    setTheaterOpen(true);
  };

  const heroLabel = React.useMemo(() => {
    if (mediaType === "tv") {
      if (resumeAt != null && resumeDetail) {
        return `Resume · ${resumeDetail}`;
      }
      if (resumeDetail) {
        return `Play · ${resumeDetail}`;
      }
      return "Play";
    }
    return resumeAt != null ? `Resume · ${formatTimecode(resumeAt)}` : "Play";
  }, [mediaType, resumeAt, resumeDetail]);

  return (
    <>
      {variant === "hero" && (
        <Button
          type="button"
          size="lg"
          onClick={openTheater}
          className={cn(
            "relative group h-12 px-6 rounded-xl font-semibold text-sm tracking-wide transition-all duration-300",
            "bg-primary hover:bg-primary/90 text-white",
            "shadow-[0_0_20px_rgba(29,144,245,0.35)] hover:shadow-[0_0_30px_rgba(29,144,245,0.55)]",
            "border border-primary/40 hover:scale-[1.02] active:scale-[0.98]",
            className,
          )}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-primary group-hover:scale-110 transition-transform">
              <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
            </span>
            <span>{heroLabel}</span>
          </span>
        </Button>
      )}

      {variant === "panel" && (
        <Button
          type="button"
          size="sm"
          onClick={openTheater}
          className={cn(
            "w-full h-9 rounded-xl font-medium text-xs tracking-wide transition-all",
            "bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30",
            "hover:shadow-[0_0_15px_rgba(29,144,245,0.25)]",
            className,
          )}
        >
          <Play className="h-3.5 w-3.5 fill-current mr-2" />
          <span>Play</span>
        </Button>
      )}

      {variant === "compact" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openTheater}
          className={cn(
            "h-8 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:text-white text-xs",
            className,
          )}
        >
          <Play className="h-3 w-3 fill-current" />
          <span>Play</span>
        </Button>
      )}

      {variant === "icon" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openTheater}
          className={cn(
            "h-7 w-7 p-0 rounded-full text-primary hover:bg-primary/20 hover:text-white transition-colors",
            className,
          )}
          title={`Play S${playSeason} E${playEpisode}`}
        >
          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
        </Button>
      )}

      {theaterOpen ? (
        <StreamingTheaterModal
          key={openToken}
          open={theaterOpen}
          onOpenChange={setTheaterOpen}
          title={title}
          tmdbId={tmdbId}
          mediaType={mediaType}
          identity={identity}
          currentSeason={playSeason}
          currentEpisode={playEpisode}
        />
      ) : null}
    </>
  );
}
