"use client";

import * as React from "react";
import Hls from "hls.js";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Layers,
  Maximize2,
  Music,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipForward,
  Subtitles,
  Tv2,
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

const AUDIO_LANG_DISPLAY: Record<string, string> = {
  en: "English",
  eng: "English",
  hi: "Hindi",
  hin: "Hindi",
  es: "Spanish",
  spa: "Spanish",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  fr: "French",
  fre: "French",
  fra: "French",
  de: "German",
  ger: "German",
  deu: "German",
  it: "Italian",
  ita: "Italian",
  pt: "Portuguese",
  por: "Portuguese",
  ru: "Russian",
  rus: "Russian",
  zh: "Chinese",
  chi: "Chinese",
  zho: "Chinese",
  ar: "Arabic",
  ara: "Arabic",
  ta: "Tamil",
  tam: "Tamil",
  te: "Telugu",
  tel: "Telugu",
  ml: "Malayalam",
  mal: "Malayalam",
};

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
  onOpenServers?: () => void;
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
  onNextEpisode?: () => void;
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
  onOpenServers,
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
  onNextEpisode,
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
  const [audioTracks, setAudioTracks] = React.useState<{ name: string; index: number; lang?: string }[]>([{ name: "Track 1", index: 0 }]);
  const [audio, setAudio] = React.useState(0);
  const [subId, setSubId] = React.useState<string>("off");
  const [cueText, setCueText] = React.useState("");
  const [buffering, setBuffering] = React.useState(false);
  const [showControls, setShowControls] = React.useState(true);
  const [showPauseOverlay, setShowPauseOverlay] = React.useState(false);
  const [logoFailed, setLogoFailed] = React.useState(false);
  const pauseTimerRef = React.useRef<number | null>(null);
  const didAutoSub = React.useRef(false);
  const didAutoAudio = React.useRef(false);

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
      const syncAudio = (tracks: typeof hls.audioTracks) => {
        if (!tracks || tracks.length === 0) {
          setAudioTracks([{ name: "Track 1", index: 0 }]);
          return;
        }
        const hasExplicitEnglish = tracks.some((t) => {
          const lang = (t.lang || "").toLowerCase();
          const name = (t.name || "").toLowerCase();
          return (
            lang === "en" ||
            lang === "eng" ||
            lang.startsWith("en-") ||
            /(^|\b)(en|eng|english)($|\b)/i.test(name) ||
            name.includes("english")
          );
        });
        const mapped = tracks.map((track, index) => {
          let name = track.name;
          if (!name || name === `Audio ${index + 1}` || name === "audio") {
            name = `Track ${index + 1}`;
          }
          const langKey = (track.lang || "").toLowerCase();
          const langName = AUDIO_LANG_DISPLAY[langKey];
          if (langName && !name.toLowerCase().includes(langName.toLowerCase())) {
            name = `${langName} (${name})`;
          } else if (!hasExplicitEnglish && tracks.length >= 2 && index === 1) {
            if (!name.toLowerCase().includes("english")) {
              name = `English (${name})`;
            }
          }
          return {
            name,
            index,
            lang: track.lang || (!hasExplicitEnglish && tracks.length >= 2 && index === 1 ? "en" : undefined),
          };
        });
        setAudioTracks(mapped);
        if (hls.audioTrack >= 0 && hls.audioTrack < mapped.length) {
          setAudio(hls.audioTrack);
        }
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(
          hls.levels.map((item, index) => ({
            height: item.height || 0,
            index,
          })),
        );
        syncAudio(hls.audioTracks);
        if (hls.levels.length > 0) {
          hls.currentLevel = -1;
          setLevel(-1);
        }
        startPlayback();
      });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        syncAudio(data.audioTracks);
      });
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        if (data.id >= 0) setAudio(data.id);
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
      video.addEventListener("loadedmetadata", () => {
        const v = video as any;
        if (v.audioTracks && v.audioTracks.length > 0) {
          const rawTracks = Array.from(v.audioTracks);
          const hasExplicitEnglish = rawTracks.some((t: any) => {
            const lang = (t.language || "").toLowerCase();
            const label = (t.label || "").toLowerCase();
            return lang === "en" || lang === "eng" || label.includes("english");
          });
          const mapped = rawTracks.map((t: any, i: number) => {
            let name = t.label || `Track ${i + 1}`;
            if (!hasExplicitEnglish && rawTracks.length >= 2 && i === 1) {
              name = `English (${name})`;
            }
            return {
              name,
              index: i,
              lang: t.language || (!hasExplicitEnglish && rawTracks.length >= 2 && i === 1 ? "en" : undefined),
            };
          });
          setAudioTracks(mapped);
          let targetIndex = mapped.findIndex(
            (t) => t.lang === "en" || t.name.toLowerCase().includes("english")
          );
          if (targetIndex < 0 && mapped.length >= 2) targetIndex = 1;
          const selected = targetIndex >= 0 ? targetIndex : 0;
          for (let i = 0; i < v.audioTracks.length; i++) {
            v.audioTracks[i].enabled = i === selected;
          }
          setAudio(selected);
        }
        startPlayback();
      }, { once: true });
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
    const onEnded = () => {
      if (onNextEpisode) {
        onNextEpisode();
      }
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWait);
    video.addEventListener("playing", onPlay);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("playing", onPlay);
      video.removeEventListener("ended", onEnded);
    };
  }, [onProgress, revealControls]);

  React.useEffect(() => {
    didAutoSub.current = false;
    didAutoAudio.current = false;
  }, [src]);

  React.useEffect(() => {
    if (didAutoSub.current || externalSubtitles.length === 0) return;
    const index = externalSubtitles.findIndex(
      (sub) => sub.language === "en" || /^english/i.test(sub.label),
    );
    didAutoSub.current = true;
    setSubId(`ext-${index >= 0 ? index : 0}`);
  }, [externalSubtitles]);

  // Default audio track to English if available across all movies and shows
  React.useEffect(() => {
    if (didAutoAudio.current || audioTracks.length === 0) return;
    let englishIndex = audioTracks.findIndex((track) => {
      const lang = (track.lang || "").toLowerCase();
      const name = (track.name || "").toLowerCase();
      return (
        lang === "en" ||
        lang === "eng" ||
        lang.startsWith("en-") ||
        /(^|\b)(en|eng|english)($|\b)/i.test(name) ||
        name.includes("english") ||
        name.includes("(en)")
      );
    });
    // Fallback: If no explicit English tag, and multiple tracks exist, Track 2 (index 1) is English
    if (englishIndex < 0 && audioTracks.length >= 2) {
      englishIndex = 1;
    }
    didAutoAudio.current = true;
    const target = englishIndex >= 0 ? englishIndex : 0;
    if (target !== audio) {
      applyAudio(target);
    }
  }, [audioTracks, audio]);

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
    const video = videoRef.current as any;
    if (hls && hls.audioTracks && hls.audioTracks.length > index) {
      hls.audioTrack = index;
    } else if (video && video.audioTracks && video.audioTracks.length > index) {
      for (let i = 0; i < video.audioTracks.length; i++) {
        video.audioTracks[i].enabled = i === index;
      }
    }
    setAudio(index);
    setPanel("none");
  };

  const qualityLabel = React.useMemo(() => {
    if (level < 0) {
      if (playingHeight >= 2160) return "Auto (4K)";
      if (playingHeight >= 1080) return "Auto (HD)";
      if (playingHeight > 0) return `Auto (${playingHeight}p)`;
      return "Auto";
    }
    const h = levels[level]?.height || 0;
    if (h >= 2160) return "4K";
    if (h >= 1080) return "HD";
    return `${h}p`;
  }, [level, levels, playingHeight]);
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
            className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-full text-white/80 transition-[background-color,transform,color] duration-150 hover:bg-white/10 hover:text-white active:scale-95"
            title="Back (Esc)"
            aria-label="Back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
        </div>

        {/* Center: Subtle Context Title */}
        <div className="hidden md:flex flex-col items-center justify-center text-center pointer-events-none px-4 min-w-0">
          <span className="text-sm sm:text-base font-semibold tracking-wide text-white/90 truncate max-w-md">
            {title}
          </span>
          {mediaType === "tv" && (
            <span className="text-xs uppercase font-mono tracking-widest text-white/50 mt-0.5">
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
          "absolute inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black/95 via-black/50 to-transparent px-6 pb-6 pt-20 text-white",
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
              <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-current ml-0.5" />
            ) : (
              <Pause className="h-5 w-5 sm:h-6 sm:w-6 fill-current" />
            )}
          </IconButton>
          <IconButton title="Back 10 seconds" onClick={() => seekTo(current - 10)}>
            <span className="relative inline-flex h-5 w-5 sm:h-[22px] sm:w-[22px] items-center justify-center">
              <RotateCcw className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
              <span className="absolute inset-0 flex items-center justify-center pt-px text-[8px] sm:text-[9px] font-semibold leading-none">
                10
              </span>
            </span>
          </IconButton>
          <IconButton title="Forward 10 seconds" onClick={() => seekTo(current + 10)}>
            <span className="relative inline-flex h-5 w-5 sm:h-[22px] sm:w-[22px] items-center justify-center">
              <RotateCw className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
              <span className="absolute inset-0 flex items-center justify-center pt-px text-[8px] sm:text-[9px] font-semibold leading-none">
                10
              </span>
            </span>
          </IconButton>
          {onNextEpisode ? (
            <IconButton title="Next Episode" onClick={onNextEpisode}>
              <SkipForward className="h-5 w-5 sm:h-[22px] sm:w-[22px] fill-current" />
            </IconButton>
          ) : null}
          <span className="ml-2 min-w-[8.5rem] font-mono text-xs sm:text-sm tabular-nums tracking-wide text-white/75">
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
              <VolumeX className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
            ) : (
              <Volume2 className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
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
            title="Audio Tracks"
            active={panel === "audio"}
            onClick={() => setPanel(panel === "audio" ? "none" : "audio")}
          >
            <Music className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
          </IconButton>
          <IconButton
            title="Subtitles"
            active={subId !== "off"}
            onClick={() => setPanel(panel === "subs" ? "none" : "subs")}
          >
            <Subtitles className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
          </IconButton>
          <IconButton
            title="Settings"
            active={panel === "settings" || panel === "quality" || panel === "speed"}
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
          >
            <Settings2 className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
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
            <PictureInPicture2 className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
          </IconButton>
          <IconButton title="Fullscreen" onClick={() => onToggleFullscreen?.()}>
            <Maximize2 className="h-5 w-5 sm:h-[22px] sm:w-[22px]" />
          </IconButton>
        </div>
      </div>

      {/* Popover Setting Panels - Cinejoy Style */}
      {panel !== "none" ? (
        <div
          className="absolute bottom-[5.75rem] right-6 z-[110] w-72 sm:w-80 origin-bottom-right overflow-hidden rounded-2xl border border-white/[0.14] bg-black/40 text-white shadow-[0_24px_70px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.15)] backdrop-blur-3xl ring-1 ring-white/10 transition-all duration-200"
          style={{ zIndex: 110 }}
          onClick={(event) => event.stopPropagation()}
        >
          {panel === "settings" ? (
            <div className="p-3">
              {/* 2x2 Feature Grid Matching Cinejoy */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPanel("quality")}
                  className="group flex flex-col items-start rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-all duration-150 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98] backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    <Tv2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>Quality</span>
                  </div>
                  <span className="mt-1 text-sm font-bold text-white tracking-wide truncate max-w-full">
                    {qualityLabel}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onOpenServers) {
                      setPanel("none");
                      onOpenServers();
                    }
                  }}
                  className="group flex flex-col items-start rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-all duration-150 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98] backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    <Layers className="h-3.5 w-3.5 text-amber-400" />
                    <span>Server</span>
                  </div>
                  <span className="mt-1 text-sm font-bold text-white tracking-wide truncate max-w-full">
                    {serverName || "Lisbon"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPanel("subs")}
                  className="group flex flex-col items-start rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-all duration-150 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98] backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    <Subtitles className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Subtitles</span>
                  </div>
                  <span className="mt-1 text-sm font-bold text-white tracking-wide truncate max-w-full">
                    {activeSub}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPanel("audio")}
                  className="group flex flex-col items-start rounded-xl border border-white/[0.08] bg-white/[0.04] p-2.5 text-left transition-all duration-150 hover:bg-white/[0.08] hover:border-white/20 active:scale-[0.98] backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                    <Music className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Audio</span>
                  </div>
                  <span className="mt-1 text-sm font-bold text-white tracking-wide truncate max-w-full">
                    {audioTracks[audio]?.name ?? "Track 1"}
                  </span>
                </button>
              </div>

              <div className="my-2.5 h-px bg-white/10" />

              {/* Subtitles Toggle Row */}
              <div className="flex items-center justify-between rounded-xl px-2.5 py-2 text-white/90 hover:bg-white/[0.04] transition">
                <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                  <Subtitles className="h-4 w-4 text-white/60" />
                  <span>Enable Subtitles</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (subId !== "off") {
                      setSubId("off");
                    } else if (externalSubtitles.length > 0) {
                      const idx = externalSubtitles.findIndex((s) => s.language === "en" || /english/i.test(s.label));
                      setSubId(`ext-${idx >= 0 ? idx : 0}`);
                    }
                  }}
                  className={cn(
                    "relative inline-flex h-5 w-9 sm:h-6 sm:w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    subId !== "off" ? "bg-primary" : "bg-white/20",
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-white shadow transform ring-0 transition duration-200 ease-in-out",
                      subId !== "off" ? "translate-x-4 sm:translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>

              {/* Playback Settings (Speed) */}
              <button
                type="button"
                onClick={() => setPanel("speed")}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-white/90 hover:bg-white/[0.05] transition"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                  <Gauge className="h-4 w-4 text-white/60" />
                  <span>Playback Settings</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-white/50 font-mono">
                  <span>{speed}x</span>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                </div>
              </button>

              {/* Audio Tracks Row */}
              <button
                type="button"
                onClick={() => setPanel("audio")}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-white/90 hover:bg-white/[0.05] transition"
              >
                <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
                  <Music className="h-4 w-4 text-emerald-400" />
                  <span>Audio Tracks</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-white/50">
                  <span className="truncate max-w-[6rem] sm:max-w-[8rem]">
                    {audioTracks[audio]?.name ?? "Track 1"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-white/40" />
                </div>
              </button>
            </div>
          ) : null}

          {panel === "audio" ? (
            <div className="p-2.5">
              <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.02] px-2 pb-2.5 pt-1 text-white">
                <button
                  type="button"
                  onClick={() => setPanel("settings")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition"
                  title="Back to Settings"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-bold tracking-wider uppercase text-white/90">Audio</span>
              </div>
              <div className="max-h-64 overflow-y-auto pt-1.5 space-y-1">
                {audioTracks.map((track) => {
                  const isSelected = audio === track.index;
                  return (
                    <button
                      key={String(track.index)}
                      type="button"
                      onClick={() => applyAudio(track.index)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs sm:text-sm transition duration-150",
                        isSelected
                          ? "bg-white/[0.12] text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] border border-white/[0.1]"
                          : "text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent active:scale-[0.98]",
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Music className={cn("h-4 w-4 shrink-0", isSelected ? "text-emerald-400" : "text-white/50")} />
                        <span className="truncate font-medium">{track.name}</span>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 fill-emerald-400/20 shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
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
                  sublabel:
                    playingHeight > 0
                      ? `${playingHeight >= 2160 ? "4K (2160p)" : playingHeight >= 1080 ? "HD (1080p)" : `${playingHeight}p`} · Current`
                      : "Optimal",
                  active: level < 0,
                  onSelect: () => applyLevel(-1),
                },
                ...[...levels]
                  .sort((a, b) => b.height - a.height)
                  .map((item) => {
                    let label = `${item.height}p`;
                    let sublabel: string | undefined = undefined;

                    if (item.height >= 2160) {
                      label = "4K";
                      sublabel = "2160p";
                    } else if (item.height >= 1080) {
                      label = "HD";
                      sublabel = "1080p";
                    } else if (item.height >= 720) {
                      label = "720p";
                      sublabel = "HD";
                    } else if (item.height >= 480) {
                      label = "480p";
                      sublabel = "SD";
                    } else {
                      label = `${item.height}p`;
                    }

                    return {
                      key: String(item.index),
                      label,
                      sublabel,
                      active: level === item.index,
                      onSelect: () => applyLevel(item.index),
                    };
                  }),
              ]}
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
        "inline-flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full text-white transition-[background-color,transform,color] duration-150 ease-out",
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
  items: {
    key: string;
    label: string;
    sublabel?: string;
    active: boolean;
    onSelect: () => void;
  }[];
}) {
  return (
    <div className="flex max-h-[50vh] flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
            aria-label="Back"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : (
          <span className="w-2" />
        )}
        <p className="text-xs font-bold tracking-wider uppercase text-white/90">{title}</p>
      </div>
      <div className="overflow-y-auto py-1.5 px-2 space-y-1">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={cn(
              "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-150",
              item.active
                ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] border border-white/[0.1]"
                : "text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent active:scale-[0.98]",
            )}
            onClick={item.onSelect}
          >
            <div className="flex flex-col items-start min-w-0">
              <span className="text-sm font-semibold tracking-wide text-white">{item.label}</span>
              {item.sublabel ? (
                <span className="text-[11px] font-mono text-white/50 tracking-wider mt-0.5">
                  {item.sublabel}
                </span>
              ) : null}
            </div>
            {item.active ? (
              <CheckCircle2 className="h-4 w-4 text-primary fill-primary/20 shrink-0 ml-2" />
            ) : null}
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
      className="group/vol relative mx-1 hidden h-6 w-20 sm:w-24 cursor-pointer items-center sm:flex"
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
      <div className="relative h-[4px] w-full rounded-full bg-white/20">
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
      className="group relative mb-4 flex h-6 w-full cursor-pointer items-center"
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
      <div className="relative h-1 w-full rounded-full bg-white/25 transition-[height] duration-150 group-hover:h-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-[0_0_10px_rgba(29,144,245,0.85)] transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}
