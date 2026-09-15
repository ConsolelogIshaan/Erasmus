"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListVideo,
  Maximize2,
  Minimize2,
  Play,
  RotateCw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
  getTvShowResume,
  parsePlaybackTime,
  resumeSeconds,
  savePlaybackProgress,
} from "@/lib/streaming/playback-progress";
import type { MediaIdentity } from "@/types/library";
import type { TvEpisode, TvSeason } from "@/types/media";
import {
  actionSetMovieProgress,
  actionSetTvProgress,
  actionUpsertAndSetStatus,
} from "@/features/library/actions/library-actions";
import { cn } from "@/lib/utils";
import { stillUrl } from "@/lib/media/image";

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
  logoPath?: string | null;
  tagline?: string | null;
  isAnime?: boolean;
  onEpisodeChange?: (season: number, episode: number) => void;
}


// ─────────────────────────────────────────────────────────────────────────────
// EpisodeRail – Netflix-style horizontal episode card rail
// ─────────────────────────────────────────────────────────────────────────────
interface EpisodeRailProps {
  episodes: TvEpisode[];
  pickerSeason: number;
  activeSeason: number;
  activeEpisode: number;
  onSeasonChange: (updater: (s: number) => number) => void;
  onSelectEpisode: (season: number, episode: number) => void;
}

function EpisodeRail({
  episodes,
  pickerSeason,
  activeSeason,
  activeEpisode,
  onSeasonChange,
  onSelectEpisode,
}: EpisodeRailProps) {
  const railRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const syncScroll = React.useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    syncScroll();
  }, [episodes, syncScroll]);

  // Auto-scroll to active episode
  React.useEffect(() => {
    const el = railRef.current;
    if (!el || episodes.length === 0) return;
    const activeIdx = episodes.findIndex(
      (ep) => ep.seasonNumber === activeSeason && ep.episodeNumber === activeEpisode,
    );
    if (activeIdx < 0) return;
    const cardW = 200;
    const offset = Math.max(0, activeIdx * cardW - el.clientWidth / 2 + cardW / 2);
    el.scrollTo({ left: offset, behavior: "smooth" });
  }, [episodes, activeSeason, activeEpisode]);

  const scroll = (dir: "left" | "right") => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "right" ? 420 : -420, behavior: "smooth" });
  };

  return (
    <div
      className="mx-4 overflow-hidden rounded-2xl border border-white/[0.14] bg-black/60 text-white shadow-[0_-8px_60px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-3xl ring-1 ring-white/[0.08]"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.03] px-4 py-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-bold tracking-widest uppercase text-white/90">
            Episodes
          </p>
          {episodes.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/55">
              {episodes.length}
            </span>
          )}
        </div>
        {/* Season switcher */}
        <div className="flex items-center gap-0.5 rounded-full bg-white/[0.06] px-1 py-0.5 ring-1 ring-white/[0.1]">
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-25"
            disabled={pickerSeason <= 1}
            onClick={() => onSeasonChange((s) => Math.max(1, s - 1))}
            aria-label="Previous season"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[5rem] text-center text-[12px] font-semibold text-white">
            Season {pickerSeason}
          </span>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            onClick={() => onSeasonChange((s) => s + 1)}
            aria-label="Next season"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Card rail */}
      <div className="relative">
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll episodes left"
            className="absolute left-0 top-0 bottom-0 z-10 flex w-14 items-center justify-start pl-2 bg-gradient-to-r from-black/80 to-transparent text-white/80 transition-opacity hover:text-white"
          >
            <ChevronLeft className="h-6 w-6 drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
          </button>
        )}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll episodes right"
            className="absolute right-0 top-0 bottom-0 z-10 flex w-14 items-center justify-end pr-2 bg-gradient-to-l from-black/80 to-transparent text-white/80 transition-opacity hover:text-white"
          >
            <ChevronRight className="h-6 w-6 drop-shadow-[0_0_6px_rgba(0,0,0,0.9)]" />
          </button>
        )}

        {episodes.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-white/35">
            No episodes in this season.
          </p>
        ) : (
          <div
            ref={railRef}
            onScroll={syncScroll}
            className="flex gap-3 overflow-x-auto px-4 py-4"
            style={{ scrollbarWidth: "none" }}
          >
            {episodes.map((episode) => {
              const active =
                episode.seasonNumber === activeSeason &&
                episode.episodeNumber === activeEpisode;
              const thumb = stillUrl(episode.stillPath, "w300");
              const epCode = `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;

              return (
                <button
                  key={`${episode.seasonNumber}-${episode.episodeNumber}`}
                  type="button"
                  onClick={() =>
                    onSelectEpisode(episode.seasonNumber, episode.episodeNumber)
                  }
                  className={cn(
                    "group relative flex shrink-0 w-44 sm:w-48 flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 active:scale-[0.97]",
                    active
                      ? "border-primary/60 ring-2 ring-primary/35 shadow-[0_0_22px_rgba(99,102,241,0.4)]"
                      : "border-white/[0.07] hover:border-white/25 hover:shadow-[0_4px_24px_rgba(0,0,0,0.55)]",
                  )}
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-white/[0.05]">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={episode.name ?? epCode}
                        className={cn(
                          "h-full w-full object-cover transition-transform duration-300",
                          "group-hover:scale-[1.05]",
                          active && "brightness-75",
                        )}
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Play className="h-8 w-8 text-white/20" />
                      </div>
                    )}
                    {/* Bottom gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

                    {/* Episode code badge */}
                    <span
                      className={cn(
                        "absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wider backdrop-blur-sm",
                        active
                          ? "bg-primary text-white"
                          : "bg-black/55 text-white/65",
                      )}
                    >
                      {epCode}
                    </span>

                    {/* Now Playing overlay */}
                    {active && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-[11px] font-bold tracking-wide text-white shadow-lg backdrop-blur-sm">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                          Now Playing
                        </span>
                      </div>
                    )}

                    {/* Hover play icon */}
                    {!active && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 pointer-events-none">
                        <div className="rounded-full bg-white/20 p-2.5 backdrop-blur-sm ring-1 ring-white/20">
                          <Play className="h-5 w-5 fill-white text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col gap-1 p-2.5">
                    <p
                      className={cn(
                        "line-clamp-1 text-[12px] font-semibold leading-snug",
                        active ? "text-white" : "text-white/90 group-hover:text-white",
                      )}
                    >
                      {episode.name || `Episode ${episode.episodeNumber}`}
                    </p>
                    {episode.overview ? (
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-white/40">
                        {episode.overview}
                      </p>
                    ) : null}
                    {episode.runtime ? (
                      <p className="mt-0.5 text-[10px] font-mono text-white/30">
                        {episode.runtime} min
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function StreamingTheaterModal({
  open,
  onOpenChange,
  title,
  tmdbId,
  mediaType,
  identity,
  currentSeason = 1,
  currentEpisode = 1,  logoPath,
  tagline,

  isAnime = false,
  onEpisodeChange,
}: StreamingTheaterModalProps) {
  const [activeSeason, setActiveSeason] = React.useState(currentSeason);
  const [activeEpisode, setActiveEpisode] = React.useState(currentEpisode);
  const [resolvedLogoPath, setResolvedLogoPath] = React.useState<string | null>(logoPath ?? null);
  const [resolvedTagline, setResolvedTagline] = React.useState<string | null>(tagline ?? null);

  React.useEffect(() => {
    if (logoPath !== undefined) setResolvedLogoPath(logoPath);
  }, [logoPath]);

  React.useEffect(() => {
    if (tagline !== undefined) setResolvedTagline(tagline);
  }, [tagline]);

  const [resolvedPosterPath, setResolvedPosterPath] = React.useState<string | null>(
    identity?.posterPath ?? null
  );
  const [canonicalTitle, setCanonicalTitle] = React.useState<string>(title);

  React.useEffect(() => {
    if (!open || !tmdbId) return;
    let cancelled = false;
    fetch(`/api/media/details?type=${mediaType}&id=${tmdbId}&_v=2`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { logoPath?: string | null; tagline?: string | null; posterPath?: string | null; title?: string | null } | null) => {
        if (cancelled || !data) return;
        if (data.logoPath) setResolvedLogoPath(data.logoPath);
        if (data.tagline) setResolvedTagline(data.tagline);
        if (data.posterPath) setResolvedPosterPath(data.posterPath);
        if (data.title && (title.includes(",") || title.length > 35)) setCanonicalTitle(data.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, mediaType, tmdbId, title]);
  const [key, setKey] = React.useState(0);
  const [extractNonce, setExtractNonce] = React.useState(0);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [directSrc, setDirectSrc] = React.useState<string | null>(null);
  const [directKind, setDirectKind] = React.useState<"hls" | "file">("hls");
  const [directTried, setDirectTried] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = React.useState("lisbon");
  const [serversOpen, setServersOpen] = React.useState(false);
  const [episodesOpen, setEpisodesOpen] = React.useState(false);
  const [seasonEpisodes, setSeasonEpisodes] = React.useState<TvEpisode[]>([]);
  const [pickerSeason, setPickerSeason] = React.useState(currentSeason);
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
    setEpisodesOpen(false);
    setExternalSubtitles([]);
    setPickerSeason(season);
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
      const label =
        mediaType === "tv"
          ? `S${season}:E${episode} from ${formatTimecode(resume)}`
          : `from ${formatTimecode(resume)}`;
      toast.info(`Resuming ${label}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot episode at open only
  }, [open]);

  const effectiveIdentity: MediaIdentity = React.useMemo(() => {
    if (identity) return identity;
    return {
      provider: "tmdb",
      mediaType,
      externalId: String(tmdbId),
      title,
    };
  }, [identity, mediaType, tmdbId, title]);

  const progressInput = React.useMemo(
    () => ({
      mediaType,
      tmdbId,
      season: activeSeason,
      episode: activeEpisode,
      title: canonicalTitle || title,
      posterPath: resolvedPosterPath ?? effectiveIdentity.posterPath ?? null,
      backdropPath: effectiveIdentity.backdropPath ?? null,
    }),
    [mediaType, tmdbId, activeSeason, activeEpisode, title, effectiveIdentity],
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
              const relayed = data.captions.map((c) => ({
                ...c,
                url: c.url.startsWith("http")
                  ? `/api/stream/subs/file?url=${encodeURIComponent(c.url)}`
                  : c.url,
              }));
              setExternalSubtitles((current) => {
                const seen = new Set(relayed.map((r) => r.url));
                const merged = [...relayed];
                for (const item of current) {
                  if (!seen.has(item.url)) {
                    seen.add(item.url);
                    merged.push(item);
                  }
                }
                return merged;
              });
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
        if (tracks.length) {
          setExternalSubtitles((current) => {
            const seen = new Set(current.map((c) => c.url));
            const merged = [...current];
            for (const item of tracks) {
              if (!seen.has(item.url)) {
                seen.add(item.url);
                merged.push(item);
              }
            }
            return merged;
          });
        }
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
        effectiveIdentity &&
        Date.now() - lastLibrarySyncRef.current > 60_000
      ) {
        lastLibrarySyncRef.current = Date.now();
        if (mediaType === "movie") {
          actionSetMovieProgress(
            effectiveIdentity,
            Math.max(1, Math.round(seconds / 60)),
          ).catch(() => {});
        } else if (mediaType === "tv") {
          actionSetTvProgress(
            effectiveIdentity,
            activeSeason,
            activeEpisode,
            [],
          ).catch(() => {});
        }
      }
    },
    [effectiveIdentity, mediaType, progressInput, activeSeason, activeEpisode],
  );

  React.useEffect(() => {
    if (open && effectiveIdentity) {
      actionUpsertAndSetStatus(effectiveIdentity, "watching").catch(() => {});
      if (mediaType === "tv") {
        actionSetTvProgress(
          effectiveIdentity,
          activeSeason,
          activeEpisode,
          [],
        ).catch(() => {});
      }
    }
  }, [open, effectiveIdentity, mediaType, activeSeason, activeEpisode]);

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
      if (effectiveIdentity && lastKnownRef.current.seconds >= 15) {
        if (mediaType === "movie") {
          actionSetMovieProgress(
            effectiveIdentity,
            Math.max(1, Math.round(lastKnownRef.current.seconds / 60)),
          ).catch(() => {});
        } else if (mediaType === "tv") {
          actionSetTvProgress(
            effectiveIdentity,
            activeSeason,
            activeEpisode,
            [],
          ).catch(() => {});
        }
      }
    };
  }, [open, persistProgress, effectiveIdentity, mediaType, activeSeason, activeEpisode]);

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

  React.useEffect(() => {
    if (!open || mediaType !== "tv") return;
    let cancelled = false;
    fetch(`/api/media/tv/${tmdbId}/season/${pickerSeason}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: TvSeason | null) => {
        if (cancelled) return;
        const episodes = (data?.episodes ?? []).filter(
          (episode) => episode.episodeNumber > 0,
        );
        setSeasonEpisodes(episodes);
      })
      .catch(() => {
        if (!cancelled) setSeasonEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mediaType, tmdbId, pickerSeason]);

  const handleNextEpisode = React.useCallback(() => {
    if (mediaType !== "tv") return;
    const nextEpNum = activeEpisode + 1;
    const existsInCurrent = seasonEpisodes.some((ep) => ep.episodeNumber === nextEpNum);
    if (existsInCurrent) {
      handleSelectEpisode(activeSeason, nextEpNum);
    } else {
      handleSelectEpisode(activeSeason + 1, 1);
    }
  }, [mediaType, activeSeason, activeEpisode, seasonEpisodes]);

  const handleSelectEpisode = (season: number, episode: number) => {
    setActiveSeason(season);
    setActiveEpisode(episode);
    setPickerSeason(season);
    setEpisodesOpen(false);
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
    wallStartRef.current = Date.now();
    setDirectSrc(null);
    setDirectTried(false);
    setLoadError(null);
    setKey((prev) => prev + 1);
    onEpisodeChange?.(season, episode);
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

  const currentEpisodeData = React.useMemo(() => {
    if (mediaType !== "tv") return null;
    return seasonEpisodes.find(
      (ep) => ep.seasonNumber === activeSeason && ep.episodeNumber === activeEpisode,
    );
  }, [mediaType, seasonEpisodes, activeSeason, activeEpisode]);

  const playerKey = `${mediaType}-${tmdbId}-s${activeSeason}-e${activeEpisode}`;

  const topRightControls = (
    <div className="flex items-center gap-0.5">
      {mediaType === "tv" && (
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-full px-3.5 sm:px-4 text-white/90 transition-[background-color,transform] duration-150 hover:bg-white/10 active:scale-[0.97]"
            onClick={() => {
              setServersOpen(false);
              setPickerSeason(activeSeason);
              setEpisodesOpen((open) => !open);
            }}
            title="Choose episode"
          >
            <ListVideo className="h-4 w-4" />
            <span className="text-[13px] sm:text-sm font-medium tracking-wide">
              S{activeSeason} E{activeEpisode}
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-white/40 transition-transform duration-200 ease-out",
                episodesOpen && "rotate-180",
              )}
            />
          </button>

        </div>
      )}

      <button
        type="button"
        className="inline-flex h-11 items-center gap-2 rounded-full px-3.5 sm:px-4 text-white/90 transition-[background-color,transform] duration-150 hover:bg-white/10 active:scale-[0.97]"
        onClick={() => {
          setEpisodesOpen(false);
          setServersOpen(true);
        }}
        title="Choose server"
      >
        <Layers className="h-4 w-4" />
        <span className="hidden text-[13px] sm:text-sm font-medium tracking-wide sm:inline">
          {selectedServer.name}
        </span>
      </button>


    </div>
  );

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
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div
            ref={containerRef}
            className="relative flex h-full w-full flex-col overflow-hidden bg-black select-none"
          >
            {!directSrc && (
              <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 bg-black">
                <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 sm:px-6">
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    title="Back (Esc)"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>

                </div>
                <div className="flex h-12 w-12 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-[2px] border-white/15 border-t-white" />
                </div>
                <p className="text-[13px] text-white/50">
                  {loadError || "Starting playback"}
                </p>
              </div>
            )}

            {open && directSrc ? (
              <NativePlayer
                key={playerKey}
                src={directSrc}
                kind={directKind}
                startAt={startAt}
                serverId={selectedServerId}
                serverName={selectedServer.name}
                onOpenServers={() => setServersOpen(true)}
                externalSubtitles={externalSubtitles}
                onToggleFullscreen={toggleFullscreen}
                onProgress={(seconds, duration) => {
                  persistProgress(seconds, duration);
                }}
                title={title}
                mediaType={mediaType}
                season={activeSeason}
                episode={activeEpisode}
                episodeTitle={currentEpisodeData?.name}
                overview={currentEpisodeData?.overview || effectiveIdentity.overview || null}
                logoPath={resolvedLogoPath}
                tagline={resolvedTagline}
                onBack={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen?.().catch(() => {});
                  }
                  onOpenChange(false);
                }}
                isExternalMenuOpen={episodesOpen || serversOpen}
                topRightControls={topRightControls}
              />
            ) : null}

            {/* Episode Rail – full-width overlay above the bottom controls bar */}
            {mediaType === "tv" && episodesOpen ? (
              <div
                className="absolute inset-x-0 z-[220] pointer-events-auto"
                style={{ bottom: "5.75rem" }}
                onClick={(e) => e.stopPropagation()}
              >
                <EpisodeRail
                  episodes={seasonEpisodes}
                  pickerSeason={pickerSeason}
                  activeSeason={activeSeason}
                  activeEpisode={activeEpisode}
                  onSeasonChange={setPickerSeason}
                  onSelectEpisode={handleSelectEpisode}
                />
              </div>
            ) : null}

            <ServersModal
              open={serversOpen}
              onOpenChange={setServersOpen}
              activeServerId={selectedServerId}
              onSelectServer={handleSelectServer}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
