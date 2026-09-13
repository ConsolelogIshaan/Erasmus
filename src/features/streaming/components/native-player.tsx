"use client";

import * as React from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Subtitles,
  Volume2,
  VolumeX,
} from "lucide-react";

import { logoUrl } from "@/lib/media/image";
import { formatTimecode } from "@/lib/streaming/playback-progress";
import {
  cuesAtTime,
  parseSubtitleCues,
  type SubtitleCue,
} from "@/lib/streaming/subtitles";
import { cn } from "@/lib/utils";

export interface ExternalSubtitle {
  label: string;
  language: string;
  url: string;
}

export interface NativePlayerProps {
  src: string;
  startAt?: number;
  kind?: "hls" | "file";
  serverId?: string;
  serverName?: string;
  externalSubtitles?: ExternalSubtitle[];
  onToggleFullscreen?: () => void;
  onProgress?: (seconds: number, duration: number) => void;
  // Cinematic metadata & contextual overlay
  title: string;
  mediaType?: "movie" | "tv";
  season?: number;
  episode?: number;
  episodeTitle?: string;
  overview?: string | null;
  logoPath?: string | null;
  tagline?: string | null;
  onBack?: () => void;
  topRightControls?: React.ReactNode;
  isExternalMenuOpen?: boolean;
}

type Panel = "none" | "settings" | "subs" | "audio" | "quality" | "speed";

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

export function NativePlayer({
  src,
  startAt = 0,
  kind = "hls",
  serverId,
  serverName,
  externalSubtitles = [],
  onToggleFullscreen,
  onProgress,
  title,
  mediaType = "movie",
  season = 1,
  episode = 1,
  episodeTitle,
  overview,
  logoPath,
  tagline,
  onBack,
  topRightControls,
  isExternalMenuOpen = false,
}: NativePlayerProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const cuesRef = React.useRef<SubtitleCue[]>([]);
  const [paused, setPaused] = React.useState(false);
  const [current, setCurrent] = React.useState(startAt);
  const [duration, setDuration] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [volume, setVolume] = React.useState(1);
  const [speed, setSpeed] = React.useState(1);
  const [panel, setPanel] = React.useState<Panel>("none");
  const [levels, setLevels] = React.useState<{ height: number; index: number }[]>([]);
  const [level, setLevel] = React.useState(-1);
  const [playingHeight, setPlayingHeight] = React.useState(0);
  const [audioTracks, setAudioTracks] = React.useState<{ name: string; index: number }[]>([]);
  const [audio, setAudio] = React.useState(0);
  const [subId, setSubId] = React.useState<string>("off");
  const [cueText, setCueText] = React.useState("");
  const [buffering, setBuffering] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  const [showPauseOverlay, setShowPauseOverlay] = React.useState(false);
  const [logoFailed, setLogoFailed] = React.useState(false);
  const pauseTimerRef = React.useRef<number | null>(null);
  const didAutoSub = React.useRef(false);

  React.useEffect(() => {
    setLogoFailed(false);
  }, [logoPath]);

  // Pause overlay timer: appears 2.5s after pause, immediately hides when playing
  React.useEffect(() => {
    if (paused) {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = window.setTimeout(() => {
        setShowPauseOverlay(true);
      }, 2500);
    } else {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
      setShowPauseOverlay(false);
    }

    return () => {
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    };
  }, [paused]);

  const revealControls = React.useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const isVideoPaused = videoRef.current?.paused ?? false;
      if (!isVideoPaused && panel === "none" && !isExternalMenuOpen) {
        setShowControls(false);
      }
    }, 3200);
  }, [panel, isExternalMenuOpen]);

  // Keep controls visible whenever external menu or settings panel is open
  React.useEffect(() => {
    if (panel !== "none" || isExternalMenuOpen) {
      setShowControls(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    } else {
      revealControls();
    }
  }, [panel, isExternalMenuOpen, revealControls]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const startPlayback = () => {
      if (startAt > 0) video.currentTime = startAt;
      video.play().catch(() => {});
    };

    if (kind === "file") {
      video.src = src;
      video.addEventListener("loadedmetadata", startPlayback, { once: true });
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        startLevel: -1,
        capLevelToPlayerSize: false,
        startPosition: startAt > 0 ? startAt : -1,
        renderTextTracksNatively: false,
        enableWebVTT: false,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(
          hls.levels.map((item, index) => ({
            height: item.height || 0,
            index,
          })),
        );
        setAudioTracks(
          hls.audioTracks.map((track, index) => ({
            name: track.name || `Audio ${index + 1}`,
            index,
          })),
        );
        if (hls.levels.length > 0) {
          hls.currentLevel = -1;
          setLevel(-1);
        }
        startPlayback();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setPlayingHeight(hls.levels[data.level]?.height || 0);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.addEventListener("loadedmetadata", startPlayback, { once: true });
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, startAt, kind]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCurrent(video.currentTime);
      setDuration(video.duration || 0);
      setPaused(video.paused);
      setCueText(cuesAtTime(cuesRef.current, video.currentTime));
      onProgress?.(video.currentTime, video.duration || 0);
    };
    const onWait = () => setBuffering(true);
    const onPlay = () => {
      setBuffering(false);
      setPaused(false);
      revealControls();
    };
    const onPause = () => {
      setPaused(true);
      setShowControls(true);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWait);
    video.addEventListener("playing", onPlay);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("playing", onPlay);
    };
  }, [onProgress, revealControls]);

  React.useEffect(() => {
    didAutoSub.current = false;
  }, [src]);

  React.useEffect(() => {
    if (didAutoSub.current || externalSubtitles.length === 0) return;
    const index = externalSubtitles.findIndex(
      (sub) => sub.language === "en" || /^english/i.test(sub.label),
    );
    didAutoSub.current = true;
    setSubId(`ext-${index >= 0 ? index : 0}`);
  }, [externalSubtitles]);

  React.useEffect(() => {
    if (subId === "off") {
      cuesRef.current = [];
      setCueText("");
      return;
    }
    const index = Number(subId.replace("ext-", ""));
    const selected = externalSubtitles[index];
    if (!selected?.url) {
      cuesRef.current = [];
      setCueText("");
      return;
    }
    let cancelled = false;
    fetch(selected.url)
      .then(async (response) => {
        const text = await response.text();
        if (!response.ok) throw new Error("subtitle fetch failed");
        return text;
      })
      .then((text) => {
        if (cancelled) return;
        cuesRef.current = parseSubtitleCues(text);
        const seconds = videoRef.current?.currentTime ?? 0;
        setCueText(cuesAtTime(cuesRef.current, seconds));
      })
      .catch(() => {
        if (cancelled) return;
        cuesRef.current = [];
        setCueText("");
      });
    return () => {
      cancelled = true;
    };
  }, [subId, externalSubtitles]);

  React.useEffect(() => {
    const onMove = () => revealControls();
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [revealControls]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const video = videoRef.current;
      if (!video) return;
      if (event.key === " " || event.key === "k") {
        event.preventDefault();
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        video.currentTime = video.currentTime + 10;
      } else if (event.key === "m") {
        video.muted = !video.muted;
        setMuted(video.muted);
      } else if (event.key === "c") {
        if (externalSubtitles.length === 0) return;
        setSubId((currentId) => {
          if (currentId === "off") return "ext-0";
          const index = Number(currentId.replace("ext-", ""));
          return index + 1 >= externalSubtitles.length ? "off" : `ext-${index + 1}`;
        });
      }
      revealControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [externalSubtitles.length, revealControls]);

  React.useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, seconds);
  };

  const applyLevel = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setLevel(index);
    if (index >= 0) setPlayingHeight(hls.levels[index]?.height || 0);
    setPanel("none");
  };

  const applyAudio = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    setAudio(index);
    setPanel("none");
  };

  const qualityLabel = level < 0 ? "Auto" : `${levels[level]?.height || ""}p`;
  const selectedHeight = level >= 0 ? levels[level]?.height || 0 : 0;
  const lisbon4k =
    serverId === "lisbon" &&
    (playingHeight >= 2160 || selectedHeight >= 2160);

  const activeSub =
    subId === "off"
      ? "Off"
      : externalSubtitles[Number(subId.replace("ext-", ""))]?.label || "On";

  const isControlsActive = showControls || panel !== "none" || isExternalMenuOpen || paused;

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute inset-0 z-[1] bg-black select-none overflow-hidden",
        isControlsActive ? "cursor-auto" : "cursor-none",
      )}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      onClick={() => {
        if (panel !== "none") {
          setPanel("none");
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
      }}
    >
      {/* Video Surface */}
      <div
        className="absolute inset-0 z-0"
        style={
          lisbon4k
            ? {
                filter: "brightness(1.42)",
                WebkitFilter: "brightness(1.42)",
                isolation: "isolate",
              }
            : undefined
        }
      >
        <video
          ref={videoRef}
          className="pointer-events-none h-full w-full bg-black object-contain"
          playsInline
          autoPlay
        />
      </div>

      {/* Centered Pause Ambient Vignette */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.85)_0%,_rgba(0,0,0,0.45)_55%,_rgba(0,0,0,0.85)_100%)]",
          "transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          showPauseOverlay ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Top Ambient Gradient */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/85 via-black/35 to-transparent z-10",
          "transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isControlsActive ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Centered Pause Cinematic Information Overlay */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center text-center px-6 pb-16 sm:pb-20 select-none",
          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          showPauseOverlay
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none",
        )}
      >
        <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50 mb-3 sm:mb-4 font-mono">
          YOU ARE WATCHING
        </div>

        {/* Authentic Movie / TV Show Logo Image if available, otherwise stylized title font */}
        {logoUrl(logoPath, "w500") && !logoFailed ? (
          <div className="relative mx-auto h-20 sm:h-28 md:h-36 lg:h-40 w-full max-w-xs sm:max-w-md md:max-w-lg mb-3 sm:mb-4">
            <img
              src={logoUrl(logoPath, "w500")!}
              alt={title}
              className="h-full w-full object-contain object-center drop-shadow-[0_8px_32px_rgba(0,0,0,0.95)]"
              onError={() => setLogoFailed(true)}
            />
          </div>
        ) : (
          <h1 className="font-display text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.95)] mb-2 max-w-2xl">
            {title}
          </h1>
        )}

        {/* TV Series Episode Info or Movie Tagline */}
        {mediaType === "tv" ? (
          <div className="flex items-center justify-center gap-2 text-sm sm:text-base md:text-lg font-medium text-white/90 drop-shadow mb-2">
            <span className="font-mono text-primary font-bold tracking-wider">
              S{String(season ?? 1).padStart(2, "0")} E{String(episode ?? 1).padStart(2, "0")}
            </span>
            {episodeTitle ? (
              <>
                <span className="text-white/30">·</span>
                <span className="text-white/90 font-medium">{episodeTitle}</span>
              </>
            ) : null}
          </div>
        ) : tagline ? (
          <p className="text-sm sm:text-base md:text-lg text-white/80 italic font-serif tracking-wide drop-shadow mb-2 max-w-lg">
            &ldquo;{tagline}&rdquo;
          </p>
        ) : null}

        {/* Short Synopsis / Overview */}
        {overview ? (
          <p className="max-w-xl text-xs sm:text-sm text-white/70 line-clamp-2 sm:line-clamp-3 leading-relaxed drop-shadow mt-1">
            {overview}
          </p>
        ) : null}
      </div>

      {/* Top Controls Area */}
      <div
        className={cn(
          "absolute top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 px-4 py-3 sm:px-6",
          "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isControlsActive
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Minimal Back Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-[background-color,transform,color] duration-150 hover:bg-white/10 hover:text-white active:scale-95"
            title="Back (Esc)"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        </div>

        {/* Center: Subtle Context Title */}
        <div className="hidden md:flex flex-col items-center justify-center text-center pointer-events-none px-4 min-w-0">
          <span className="text-[13px] font-medium tracking-wide text-white/90 truncate max-w-md">
            {title}
          </span>
          {mediaType === "tv" && (
            <span className="text-[10px] uppercase font-mono tracking-widest text-white/40 mt-0.5">
              S{String(season ?? 1).padStart(2, "0")} E{String(episode ?? 1).padStart(2, "0")}
              {episodeTitle ? ` · ${episodeTitle}` : ""}
            </span>
          )}
        </div>

        {/* Right: Existing Top Controls Slot */}
        {topRightControls ? (
          topRightControls
        ) : (
          <div className="w-10" />
        )}
      </div>

      {/* Subtitles Overlay */}
      {cueText ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-[80] flex justify-center px-8"
          style={{
            zIndex: 80,
            bottom: isControlsActive ? "6.5rem" : "2.5rem",
          }}
        >
          <p
            className="max-w-3xl whitespace-pre-line text-center text-[1.05rem] font-medium leading-snug tracking-wide text-white sm:text-xl"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)" }}
          >
            {cueText}
          </p>
        </div>
      ) : null}

      {/* Buffering Spinner */}
      {buffering ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
          <div className="h-9 w-9 animate-spin rounded-full border-[2px] border-white/15 border-t-white" />
        </div>
      ) : null}

      {/* Bottom Playback Controls Bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/95 via-black/50 to-transparent px-5 pb-5 pt-16 text-white",
          "transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isControlsActive
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0",
        )}
        style={{ zIndex: 100 }}
        onClick={(event) => event.stopPropagation()}
      >
        <SeekBar current={current} duration={duration} onSeek={seekTo} />
        <div className="mt-1 flex items-center gap-0.5">
          <IconButton
            title={paused ? "Play" : "Pause"}
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) video.play().catch(() => {});
              else video.pause();
            }}
          >
            {paused ? (
              <Play className="h-[18px] w-[18px] fill-current" />
            ) : (
              <Pause className="h-[18px] w-[18px] fill-current" />
            )}
          </IconButton>
          <IconButton title="Back 10 seconds" onClick={() => seekTo(current - 10)}>
            <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
              <RotateCcw className="h-[18px] w-[18px]" />
              <span className="absolute inset-0 flex items-center justify-center pt-px text-[7px] font-semibold leading-none">
                10
              </span>
            </span>
          </IconButton>
          <IconButton title="Forward 10 seconds" onClick={() => seekTo(current + 10)}>
            <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
              <RotateCw className="h-[18px] w-[18px]" />
              <span className="absolute inset-0 flex items-center justify-center pt-px text-[7px] font-semibold leading-none">
                10
              </span>
            </span>
          </IconButton>
          <span className="ml-1.5 min-w-[7.5rem] font-mono text-[11px] tabular-nums tracking-wide text-white/70">
            {formatTimecode(current)}
            <span className="text-white/30"> / </span>
            {formatTimecode(duration)}
          </span>
          <IconButton
            title={muted ? "Unmute" : "Mute"}
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = !video.muted;
              setMuted(video.muted);
            }}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </IconButton>
          <VolumeBar
            value={muted ? 0 : volume}
            onChange={(next) => {
              const video = videoRef.current;
              setVolume(next);
              setMuted(next === 0);
              if (video) {
                video.volume = next;
                video.muted = next === 0;
              }
            }}
          />
          <span className="flex-1" />
          <IconButton
            title="Subtitles"
            active={subId !== "off"}
            onClick={() => setPanel(panel === "subs" ? "none" : "subs")}
          >
            <Subtitles className="h-4 w-4" />
          </IconButton>
          <IconButton
            title="Settings"
            active={panel === "settings" || panel === "quality" || panel === "speed" || panel === "audio"}
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
          >
            <Settings2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            title="Picture in picture"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (document.pictureInPictureElement) {
                document.exitPictureInPicture?.().catch(() => {});
              } else {
                video.requestPictureInPicture?.().catch(() => {});
              }
            }}
          >
            <PictureInPicture2 className="h-4 w-4" />
          </IconButton>
          <IconButton title="Fullscreen" onClick={() => onToggleFullscreen?.()}>
            <Maximize2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      {/* Popover Setting Panels */}
      {panel !== "none" ? (
        <div
          className="absolute bottom-[5.25rem] right-5 z-[110] w-60 origin-bottom-right overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c]/95 text-white shadow-[0_16px_50px_rgba(0,0,0,0.55)] backdrop-blur-md"
          style={{ zIndex: 110 }}
          onClick={(event) => event.stopPropagation()}
        >
          {panel === "settings" ? (
            <div className="py-1">
              <MenuRow
                label="Quality"
                value={qualityLabel}
                onClick={() => setPanel("quality")}
              />
              <MenuRow
                label="Speed"
                value={`${speed}x`}
                onClick={() => setPanel("speed")}
              />
              {audioTracks.length > 1 ? (
                <MenuRow
                  label="Audio"
                  value={audioTracks[audio]?.name ?? "Default"}
                  onClick={() => setPanel("audio")}
                />
              ) : null}
              <MenuRow
                label="Subtitles"
                value={activeSub}
                onClick={() => setPanel("subs")}
              />
            </div>
          ) : null}
          {panel === "speed" ? (
            <ChoiceList
              title="Speed"
              onBack={() => setPanel("settings")}
              items={PLAYBACK_SPEEDS.map((rate) => ({
                key: String(rate),
                label: `${rate}x`,
                active: speed === rate,
                onSelect: () => {
                  setSpeed(rate);
                  if (videoRef.current) videoRef.current.playbackRate = rate;
                  setPanel("none");
                },
              }))}
            />
          ) : null}
          {panel === "quality" ? (
            <ChoiceList
              title="Quality"
              onBack={() => setPanel("settings")}
              items={[
                {
                  key: "auto",
                  label: "Auto",
                  active: level < 0,
                  onSelect: () => applyLevel(-1),
                },
                ...[...levels]
                  .sort((a, b) => b.height - a.height)
                  .map((item) => ({
                    key: String(item.index),
                    label: `${item.height}p`,
                    active: level === item.index,
                    onSelect: () => applyLevel(item.index),
                  })),
              ]}
            />
          ) : null}
          {panel === "audio" ? (
            <ChoiceList
              title="Audio"
              onBack={() => setPanel("settings")}
              items={audioTracks.map((track) => ({
                key: String(track.index),
                label: track.name,
                active: audio === track.index,
                onSelect: () => applyAudio(track.index),
              }))}
            />
          ) : null}
          {panel === "subs" ? (
            <ChoiceList
              title="Subtitles"
              onBack={() => setPanel("settings")}
              items={[
                {
                  key: "off",
                  label: "Off",
                  active: subId === "off",
                  onSelect: () => {
                    setSubId("off");
                    setPanel("none");
                  },
                },
                ...externalSubtitles.map((sub, index) => ({
                  key: `${sub.language}-${index}`,
                  label: sub.label,
                  active: subId === `ext-${index}`,
                  onSelect: () => {
                    setSubId(`ext-${index}`);
                    setPanel("none");
                  },
                })),
              ]}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition-[background-color,transform,color] duration-150 ease-out",
        "hover:bg-white/10 active:scale-[0.97]",
        active && "text-primary",
      )}
    >
      {children}
    </button>
  );
}

function MenuRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-white/90 transition-colors duration-150 hover:bg-white/[0.06]"
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="text-[12px] text-white/40">{value}</span>
    </button>
  );
}

function ChoiceList({
  title,
  onBack,
  items,
}: {
  title: string;
  onBack?: () => void;
  items: { key: string; label: string; active: boolean; onSelect: () => void }[];
}) {
  return (
    <div className="flex max-h-[50vh] flex-col">
      <div className="flex items-center gap-1 border-b border-white/10 px-1.5 py-1.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <p className="text-[12px] font-medium tracking-wide text-white/80">{title}</p>
      </div>
      <div className="overflow-y-auto py-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              "flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] transition-colors duration-150 hover:bg-white/[0.06]",
              item.active ? "text-white" : "text-white/70",
            )}
            onClick={item.onSelect}
          >
            <span>{item.label}</span>
            {item.active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function VolumeBar({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const pct = Math.min(100, Math.max(0, value * 100));

  const fromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onChange(ratio);
  };

  return (
    <div
      ref={trackRef}
      className="group/vol relative mx-1 hidden h-5 w-[4.5rem] cursor-pointer items-center sm:flex"
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        fromPointer(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) fromPointer(event);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      role="slider"
      aria-label="Volume"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="relative h-[3px] w-full rounded-full bg-white/20">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SeekBar({
  current,
  duration,
  onSeek,
}: {
  current: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const pct = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div
      ref={trackRef}
      className="group relative mb-3 flex h-5 w-full cursor-pointer items-center"
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) seekFromPointer(event);
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
    >
      <div className="relative h-[3px] w-full rounded-full bg-white/20 transition-[height] duration-150 group-hover:h-1.5">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-[0_0_8px_rgba(29,144,245,0.65)] transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
