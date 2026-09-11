"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  Sparkles,
  Subtitles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getPlaybackQueue } from "@/lib/streaming/stream-resolver";
import {
  formatTimecode,
  getPlaybackProgress,
  parsePlaybackTime,
  resumeSeconds,
  savePlaybackProgress,
} from "@/lib/streaming/playback-progress";
import type { MediaIdentity } from "@/types/library";
import {
  actionSetMovieProgress,
  actionUpsertAndSetStatus,
} from "@/features/library/actions/library-actions";
import { cn } from "@/lib/utils";

function isPlayerFailureMessage(data: unknown): boolean {
  if (data == null) return false;
  if (typeof data === "string") {
    return /playererror|sourceerror|playbackerror|no.?sourc/i.test(data);
  }
  if (typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  const kind = String(record.type ?? record.event ?? record.action ?? "");
  return /^(error|playererror|player_error|sourceerror|playbackerror)$/i.test(
    kind,
  );
}

interface StreamingTheaterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  tmdbId: string;
  mediaType: "movie" | "tv";
  identity?: MediaIdentity;
  currentSeason?: number;
  currentEpisode?: number;
  isAnime?: boolean;
  onEpisodeChange?: (season: number, episode: number) => void;
}

export function StreamingTheaterModal({
  open,
  onOpenChange,
  title,
  tmdbId,
  mediaType,
  identity,
  currentSeason = 1,
  currentEpisode = 1,
  isAnime = false,
  onEpisodeChange,
}: StreamingTheaterModalProps) {
  const [activeSeason, setActiveSeason] = React.useState(currentSeason);
  const [activeEpisode, setActiveEpisode] = React.useState(currentEpisode);
  const [attempt, setAttempt] = React.useState(0);
  const [key, setKey] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [iframeLoaded, setIframeLoaded] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  const [startAt, setStartAt] = React.useState(() =>
    resumeSeconds(
      getPlaybackProgress({
        mediaType,
        tmdbId,
        season: currentSeason,
        episode: currentEpisode,
      }),
    ),
  );
  const containerRef = React.useRef<HTMLDivElement>(null);
  const hideTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const attemptRef = React.useRef(0);
  const lastKnownRef = React.useRef({
    seconds: startAt,
    duration: null as number | null,
  });
  const wallStartRef = React.useRef<number | null>(null);
  const hasPlayerTimeRef = React.useRef(false);
  const didResumeToastRef = React.useRef(false);
  const lastLibrarySyncRef = React.useRef(0);

  // Every time the theater opens, lock to the episode the user clicked
  // and restart the hidden queue at Lisbon.
  React.useEffect(() => {
    if (!open) return;
    const season = Math.max(1, currentSeason || 1);
    const episode = Math.max(1, currentEpisode || 1);
    setActiveSeason(season);
    setActiveEpisode(episode);
    setAttempt(0);
    attemptRef.current = 0;
    const resume = resumeSeconds(
      getPlaybackProgress({
        mediaType,
        tmdbId,
        season,
        episode,
      }),
    );
    setStartAt(resume);
    lastKnownRef.current = { seconds: resume, duration: null };
    hasPlayerTimeRef.current = false;
    wallStartRef.current = null;
    setIframeLoaded(false);
    setKey((prev) => prev + 1);
    if (resume > 0 && !didResumeToastRef.current) {
      didResumeToastRef.current = true;
      toast.info(`Resuming from ${formatTimecode(resume)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot episode at open only
  }, [open]);

  const progressInput = React.useMemo(
    () => ({
      mediaType,
      tmdbId,
      season: activeSeason,
      episode: activeEpisode,
    }),
    [mediaType, tmdbId, activeSeason, activeEpisode],
  );

  const persistProgress = React.useCallback(
    (seconds: number, duration: number | null) => {
      if (seconds < 5) return;
      lastKnownRef.current = { seconds, duration };
      savePlaybackProgress(progressInput, seconds, duration);
      if (
        identity &&
        mediaType === "movie" &&
        Date.now() - lastLibrarySyncRef.current > 60_000
      ) {
        lastLibrarySyncRef.current = Date.now();
        actionSetMovieProgress(identity, Math.max(1, Math.round(seconds / 60))).catch(
          () => {},
        );
      }
    },
    [identity, mediaType, progressInput],
  );

  const queue = React.useMemo(
    () =>
      getPlaybackQueue({
        type: mediaType,
        tmdbId,
        season: activeSeason,
        episode: activeEpisode,
        isAnime,
        startAtSeconds: startAt,
      }),
    [mediaType, tmdbId, activeSeason, activeEpisode, isAnime, startAt],
  );

  const activeUrl = queue[Math.min(attempt, queue.length - 1)]?.url ?? "";

  const advanceFallback = React.useCallback(() => {
    setAttempt((current) => {
      const next = current + 1;
      if (next >= queue.length) return current;
      attemptRef.current = next;
      setIframeLoaded(false);
      setKey((prev) => prev + 1);
      return next;
    });
  }, [queue.length]);

  // Auto-record watching status in library
  React.useEffect(() => {
    if (open && identity) {
      actionUpsertAndSetStatus(identity, "watching").catch(() => {});
    }
  }, [open, identity]);

  // Handle browser history (popstate) & keyboard Escape for flawless Back navigation
  React.useEffect(() => {
    if (!open) return;

    window.history.pushState({ argusTheaterOpen: true }, "");

    const handlePopState = () => {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      onOpenChange(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        } else {
          onOpenChange(false);
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (isPlayerFailureMessage(event.data)) {
        advanceFallback();
        return;
      }
      const time = parsePlaybackTime(event.data);
      if (!time) return;
      hasPlayerTimeRef.current = true;
      wallStartRef.current = Date.now();
      persistProgress(time.seconds, time.duration);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, advanceFallback, persistProgress]);

  React.useEffect(() => {
    if (!open) return;

    const flushWallClock = () => {
      if (hasPlayerTimeRef.current) {
        persistProgress(
          lastKnownRef.current.seconds,
          lastKnownRef.current.duration,
        );
        return;
      }
      const wallStart = wallStartRef.current;
      if (wallStart == null) return;
      const elapsed = (Date.now() - wallStart) / 1000;
      persistProgress(
        lastKnownRef.current.seconds + elapsed,
        lastKnownRef.current.duration,
      );
      wallStartRef.current = Date.now();
    };

    const interval = window.setInterval(flushWallClock, 8000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flushWallClock();
    };
    window.addEventListener("pagehide", flushWallClock);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      flushWallClock();
      window.clearInterval(interval);
      window.removeEventListener("pagehide", flushWallClock);
      document.removeEventListener("visibilitychange", onHide);
      if (identity && mediaType === "movie" && lastKnownRef.current.seconds >= 15) {
        actionSetMovieProgress(
          identity,
          Math.max(1, Math.round(lastKnownRef.current.seconds / 60)),
        ).catch(() => {});
      }
    };
  }, [open, persistProgress, identity, mediaType]);

  // Auto-hiding HUD controls on mouse idle
  const handleMouseMove = React.useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  React.useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleReload = () => {
    setIframeLoaded(false);
    setKey((prev) => prev + 1);
    toast.success("Reloading stream...");
  };

  const handleEpisodeNavigate = (direction: "prev" | "next") => {
    const nextEp =
      direction === "next" ? activeEpisode + 1 : Math.max(1, activeEpisode - 1);
    setActiveEpisode(nextEp);
    setAttempt(0);
    attemptRef.current = 0;
    const resume = resumeSeconds(
      getPlaybackProgress({
        mediaType,
        tmdbId,
        season: activeSeason,
        episode: nextEp,
      }),
    );
    setStartAt(resume);
    lastKnownRef.current = { seconds: resume, duration: null };
    hasPlayerTimeRef.current = false;
    wallStartRef.current = Date.now();
    setIframeLoaded(false);
    setKey((prev) => prev + 1);
    if (onEpisodeChange) {
      onEpisodeChange(activeSeason, nextEp);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  React.useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const iframeKey = `${mediaType}-${tmdbId}-s${activeSeason}-e${activeEpisode}-a${attempt}-t${startAt}-${key}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "p-0 border-white/10 bg-black text-white shadow-2xl flex flex-col",
            "w-[98vw] max-w-[98rem] h-[95vh] max-h-[64rem] sm:rounded-2xl overflow-hidden",
            isFullscreen && "w-screen h-screen max-w-none max-h-none rounded-none border-0",
          )}
        >
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className="relative flex flex-col h-full w-full bg-black select-none overflow-hidden"
          >
            {/* Cinema Floating Top HUD: Accessible in windowed AND fullscreen */}
            <div
              className={cn(
                "absolute top-0 inset-x-0 z-50 flex items-center justify-between gap-3 px-4 py-3 sm:px-6",
                "bg-gradient-to-b from-black/95 via-black/80 to-transparent",
                "transition-opacity duration-300 backdrop-blur-sm",
                showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
              )}
            >
              {/* Left: Back/Exit Button & Title */}
              <div className="flex items-center gap-3 min-w-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      document.exitFullscreen?.().catch(() => {});
                    }
                    onOpenChange(false);
                  }}
                  className={cn(
                    "h-9 px-3 gap-1.5 rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white font-medium text-xs shadow-lg",
                    "hover:border-primary/50 transition-all",
                  )}
                  title="Exit video player (Esc)"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Back</span>
                </Button>

                <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(29,144,245,1)]" />

                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold truncate text-white leading-tight drop-shadow-md">
                    {title}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/80 font-mono drop-shadow">
                    {mediaType === "tv" && (
                      <span>
                        S{activeSeason} · E{activeEpisode}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Subtitles className="h-3 w-3" />
                      <span>Subtitles & Audio Available</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* TV Episode Stepper */}
                {mediaType === "tv" && (
                  <div className="flex items-center rounded-xl border border-white/15 bg-black/40 backdrop-blur-md p-0.5 mr-1 shadow-md">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-white/70 hover:text-white hover:bg-white/10"
                      disabled={activeEpisode <= 1}
                      onClick={() => handleEpisodeNavigate("prev")}
                      title="Previous Episode"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-2 text-xs font-mono font-medium text-white">
                      E{activeEpisode}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-white/70 hover:text-white hover:bg-white/10"
                      onClick={() => handleEpisodeNavigate("next")}
                      title="Next Episode"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {/* Reload Stream Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15"
                  onClick={handleReload}
                  title="Reload stream"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>

                {/* Fullscreen Toggle */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </Button>

                {/* Close Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-xl text-white/80 hover:text-white hover:bg-white/15 ml-1"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      document.exitFullscreen?.().catch(() => {});
                    }
                    onOpenChange(false);
                  }}
                  title="Close (Esc)"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Video Player Frame Area */}
            <div className="relative flex-1 w-full h-full bg-black overflow-hidden flex items-center justify-center">
              {!iframeLoaded && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black z-[2]">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 border border-primary/40 shadow-[0_0_30px_rgba(29,144,245,0.4)]">
                    <Play className="h-7 w-7 text-primary ml-0.5 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-mono uppercase tracking-widest text-primary font-semibold flex items-center justify-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Starting playback</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Loading the highest quality stream...
                    </p>
                  </div>
                </div>
              )}

              {open && activeUrl ? (
                <iframe
                  key={iframeKey}
                  src={activeUrl}
                  className="w-full h-full border-0 absolute inset-0 z-[1]"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="origin"
                  onLoad={() => {
                    setIframeLoaded(true);
                    wallStartRef.current = Date.now();
                  }}
                  onError={() => advanceFallback()}
                />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
