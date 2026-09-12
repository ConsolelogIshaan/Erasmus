"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Layers,
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
import { STREAMING_SERVERS } from "@/lib/streaming/stream-resolver";

import {
  NativePlayer,
  type ExternalSubtitle,
} from "@/features/streaming/components/native-player";
import {
  ServersModal,
  readPreferredServer,
} from "@/features/streaming/components/servers-modal";
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

function relayUrl(url: string, referer?: string) {
  const query = new URLSearchParams({ url });
  if (referer) query.set("referer", referer);
  return `/api/stream/hls?${query.toString()}`;
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
  const [key, setKey] = React.useState(0);
  const [extractNonce, setExtractNonce] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [directSrc, setDirectSrc] = React.useState<string | null>(null);
  const [directKind, setDirectKind] = React.useState<"hls" | "file">("hls");
  const [directTried, setDirectTried] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = React.useState("lisbon");
  const [serversOpen, setServersOpen] = React.useState(false);
  const [externalSubtitles, setExternalSubtitles] = React.useState<
    ExternalSubtitle[]
  >([]);
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
  const lastKnownRef = React.useRef({
    seconds: startAt,
    duration: null as number | null,
  });
  const wallStartRef = React.useRef<number | null>(null);
  const hasPlayerTimeRef = React.useRef(false);
  const didResumeToastRef = React.useRef(false);
  const lastLibrarySyncRef = React.useRef(0);

  const selectedServer =
    STREAMING_SERVERS.find((server) => server.id === selectedServerId) ??
    STREAMING_SERVERS[0]!;

  React.useEffect(() => {
    if (!open) return;
    const season = Math.max(1, currentSeason || 1);
    const episode = Math.max(1, currentEpisode || 1);
    setActiveSeason(season);
    setActiveEpisode(episode);
    setSelectedServerId(readPreferredServer());
    setServersOpen(false);
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
    setDirectSrc(null);
    setDirectTried(false);
    setLoadError(null);
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

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDirectTried(false);
    setDirectSrc(null);
    setLoadError(null);
    const query = new URLSearchParams({
      type: mediaType,
      id: tmdbId,
      title,
      season: String(activeSeason),
      episode: String(activeEpisode),
      server: selectedServerId,
    });
    fetch(`/api/stream/direct?${query}`)
      .then((response) => response.json())
      .then(
        (data: {
          ok?: boolean;
          referer?: string;
          captions?: ExternalSubtitle[];
          servers?: { url: string; kind?: "hls" | "file" }[];
        }) => {
          if (cancelled) return;
          const hit = data.servers?.[0];
          if (data.ok && hit?.url) {
            setDirectKind(hit.kind === "file" ? "file" : "hls");
            setDirectSrc(relayUrl(hit.url, data.referer));
            if (data.captions?.length) {
              setExternalSubtitles((current) =>
                current.length ? current : data.captions!,
              );
            }
            wallStartRef.current = Date.now();
          } else {
            setLoadError("This server has no file. Pick another.");
          }
          setDirectTried(true);
        },
      )
      .catch(() => {
        if (!cancelled) {
          setDirectTried(true);
          setLoadError("This server has no file. Pick another.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    open,
    mediaType,
    tmdbId,
    activeSeason,
    activeEpisode,
    selectedServerId,
    extractNonce,
    title,
  ]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const query = new URLSearchParams({ id: tmdbId });
    if (mediaType === "tv") {
      query.set("season", String(activeSeason));
      query.set("episode", String(activeEpisode));
    }
    fetch(`/api/stream/subs?${query}`)
      .then((response) => response.json())
      .then((data: { tracks?: ExternalSubtitle[] }) => {
        if (cancelled) return;
        const tracks = data.tracks ?? [];
        if (tracks.length) setExternalSubtitles(tracks);
      })
      .catch(() => {
        /* keep any captions already loaded */
      });
    return () => {
      cancelled = true;
    };
  }, [open, mediaType, tmdbId, activeSeason, activeEpisode]);

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

  React.useEffect(() => {
    if (open && identity) {
      actionUpsertAndSetStatus(identity, "watching").catch(() => {});
    }
  }, [open, identity]);

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
      const time = parsePlaybackTime(event.data);
      if (!time) return;
      hasPlayerTimeRef.current = true;
      wallStartRef.current = Date.now();
      persistProgress(time.seconds, time.duration);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [open, persistProgress]);

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
    if (!open) return;
    const onMove = () => handleMouseMove();
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [open, handleMouseMove]);

  React.useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleReload = () => {
    setDirectSrc(null);
    setDirectTried(false);
    setLoadError(null);
    setExtractNonce((prev) => prev + 1);
    setKey((prev) => prev + 1);
    toast.success("Reloading stream...");
  };

  const handleSelectServer = (serverId: string) => {
    setSelectedServerId(serverId);
    setDirectSrc(null);
    setDirectTried(false);
    setLoadError(null);
    setKey((prev) => prev + 1);
  };

  const handleEpisodeNavigate = (direction: "prev" | "next") => {
    const nextEp =
      direction === "next" ? activeEpisode + 1 : Math.max(1, activeEpisode - 1);
    setActiveEpisode(nextEp);
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
    setDirectSrc(null);
    setDirectTried(false);
    setLoadError(null);
    setKey((prev) => prev + 1);
    if (onEpisodeChange) {
      onEpisodeChange(activeSeason, nextEp);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
      return;
    }
    setIsFullscreen(true);
  };

  React.useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  React.useEffect(() => {
    if (!isFullscreen || document.fullscreenElement) return;
    const frame = window.requestAnimationFrame(() => {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isFullscreen]);

  const playerKey = `${mediaType}-${tmdbId}-s${activeSeason}-e${activeEpisode}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "p-0 border-white/10 bg-black text-white shadow-2xl flex flex-col",
            "w-[98vw] max-w-[98rem] h-[95vh] max-h-[64rem] sm:rounded-2xl overflow-hidden",
            isFullscreen && "w-screen h-screen max-w-none max-h-none rounded-none border-0",
          )}
          style={
            isFullscreen
              ? {
                  transform: "none",
                  left: 0,
                  top: 0,
                  width: "100vw",
                  height: "100vh",
                  maxWidth: "none",
                }
              : undefined
          }
        >
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className="relative flex h-full w-full flex-col overflow-hidden bg-black select-none"
          >
            <div
              className={cn(
                "absolute top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 px-4 py-3 sm:px-6",
                "bg-gradient-to-b from-black/95 via-black/80 to-transparent",
                "transition-transform duration-200",
                showControls ? "translate-y-0" : "-translate-y-full pointer-events-none",
              )}
            >
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
                      <span>
                        {externalSubtitles.length > 0
                          ? `${externalSubtitles.length} subtitle tracks`
                          : "Subtitles & Audio"}
                      </span>
                    </span>
                    <span className="text-white/50">
                      {selectedServer.flag} {selectedServer.name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
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

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 rounded-xl px-2 text-white/80 hover:text-white hover:bg-white/15"
                  onClick={() => setServersOpen(true)}
                  title="Choose server"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden text-xs font-medium sm:inline">
                    {selectedServer.name}
                  </span>
                </Button>

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

            <div className="relative flex-1 w-full h-full bg-black overflow-hidden flex items-center justify-center">
              {!directSrc && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black z-[2]">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 border border-primary/40 shadow-[0_0_30px_rgba(29,144,245,0.4)]">
                    <Play className="h-7 w-7 text-primary ml-0.5 animate-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-xs font-mono uppercase tracking-widest text-primary font-semibold flex items-center justify-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{loadError ? selectedServer.name : "Starting playback"}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {loadError || `${selectedServer.name} · ${selectedServer.badge}`}
                    </p>
                  </div>
                </div>
              )}

              {open && directSrc ? (
                <NativePlayer
                  key={playerKey}
                  src={directSrc}
                  kind={directKind}
                  startAt={startAt}
                  serverId={selectedServerId}
                  externalSubtitles={externalSubtitles}
                  onToggleFullscreen={toggleFullscreen}
                  onProgress={(seconds, duration) => {
                    persistProgress(seconds, duration);
                  }}
                />
              ) : null}

              <ServersModal
                open={serversOpen}
                onOpenChange={setServersOpen}
                activeServerId={selectedServerId}
                onSelectServer={handleSelectServer}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
