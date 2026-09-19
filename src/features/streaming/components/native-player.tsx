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
  Search,
  Settings2,
  SkipForward,
  Sliders,
  Subtitles,
  Tv2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { logoUrl } from "@/lib/media/image";
import { formatTimecode } from "@/lib/streaming/playback-progress";
import {
  cuesAtTime,
  parseSubtitleCues,
  NORM_LANG,
  LANG_NAMES,
  LANG_FLAGS,
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
  isExternal?: boolean;
  hearingImpaired?: boolean;
}

export interface NativePlayerProps {
  src: string;
  startAt?: number;
  kind?: "hls" | "file";
  serverId?: string;
  serverName?: string;
  is4KHint?: boolean;
  hdSrc?: string;
  fourKSrc?: string;
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
  is4KHint = false,
  hdSrc,
  fourKSrc,
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
  const [levels, setLevels] = React.useState<{ height: number; width?: number; bitrate?: number; index: number }[]>([]);
  const [level, setLevel] = React.useState(-1);
  const [playingHeight, setPlayingHeight] = React.useState(0);
  const [playingWidth, setPlayingWidth] = React.useState(0);
  const [audioTracks, setAudioTracks] = React.useState<{ name: string; index: number; lang?: string }[]>([
    { name: "Track 1", index: 0 },
    { name: "Track 2", index: 1 },
  ]);
  const [audio, setAudio] = React.useState(0);
  const [activeSrc, setActiveSrc] = React.useState(src);
  const [selectedQualityTier, setSelectedQualityTier] = React.useState<
    "auto" | "4k" | "1080p" | "720p" | "480p" | "360p"
  >("auto");
  const switchTimeRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    setActiveSrc(src);
    setSelectedQualityTier("auto");
    switchTimeRef.current = null;
  }, [src]);

  const [subId, setSubId] = React.useState<string>("off");
  const [cueText, setCueText] = React.useState("");
  const [subOffset, setSubOffset] = React.useState<number>(0);
  const [customSubtitles, setCustomSubtitles] = React.useState<ExternalSubtitle[]>([]);
  const allSubtitles = React.useMemo(() => {
    return [...customSubtitles, ...externalSubtitles];
  }, [customSubtitles, externalSubtitles]);
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
    if (!video || !activeSrc) return;

    const startPlayback = () => {
      video.play().catch(() => {});
    };

    const initialPosition =
      switchTimeRef.current !== null && switchTimeRef.current > 0
        ? switchTimeRef.current
        : startAt > 0
          ? startAt
          : -1;

    if (kind === "file") {
      video.src = activeSrc;
      video.addEventListener("loadedmetadata", startPlayback, { once: true });
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        startLevel: -1,
        capLevelToPlayerSize: false,
        startPosition: initialPosition,
        renderTextTracksNatively: false,
        enableWebVTT: false,
        startFragPrefetch: true,
        progressive: true,
        maxBufferLength: 60,
        maxMaxBufferLength: 180,
        maxBufferSize: 200 * 1000 * 1000,
        maxBufferHole: 0.5,
        highBufferWatchdogPeriod: 2,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 10,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(activeSrc);
      hls.attachMedia(video);
      const syncAudio = (tracks: typeof hls.audioTracks) => {
        if (!tracks || tracks.length === 0) {
          setAudioTracks([
            { name: "Track 1", index: 0 },
            { name: "Track 2", index: 1 },
          ]);
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
        const validLevels = hls.levels
          .map((item, index) => ({
            height: item.height || 0,
            width: item.width || 0,
            bitrate: item.bitrate || 0,
            url: (Array.isArray(item.url) ? item.url[0] : (item as unknown as { uri?: string })?.uri) || "",
            index,
          }))
          .filter((lvl) => lvl.height > 0 || lvl.width > 0 || Boolean(lvl.url));

        setLevels(validLevels);
        syncAudio(hls.audioTracks);

        // Start in Auto (-1) so ABR buffers smoothly without freezing, while tracking top level
        hls.currentLevel = -1;
        setLevel(-1);

        if (hls.levels.length > 0 && hls.levels[0]) {
          let top = hls.levels[0];
          let topScore = (top.width || 0) * (top.height || 0) || (top.height || 0) * 1000;
          for (let i = 1; i < hls.levels.length; i++) {
            const lvl = hls.levels[i];
            if (lvl) {
              const score = (lvl.width || 0) * (lvl.height || 0) || (lvl.height || 0) * 1000;
              if (score > topScore) {
                topScore = score;
                top = lvl;
              }
            }
          }
          if (top) {
            setPlayingHeight(top.height || 0);
            setPlayingWidth(top.width || 0);
          }
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
        const lvl = hls.levels[data.level];
        if (lvl) {
          setPlayingHeight(lvl.height || 0);
          setPlayingWidth(lvl.width || 0);
        }
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          hls.startLoad();
          if (video && video.paused) {
            video.play().catch(() => {});
          }
          return;
        }
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = activeSrc;
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
  }, [activeSrc, startAt, kind]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onDimensions = () => {
      if (video.videoHeight > 0) {
        setPlayingHeight((prev) => (prev > 0 ? prev : video.videoHeight));
      }
      if (video.videoWidth > 0) {
        setPlayingWidth((prev) => (prev > 0 ? prev : video.videoWidth));
      }
    };
    video.addEventListener("loadedmetadata", onDimensions);
    video.addEventListener("resize", onDimensions);

    const onTime = () => {
      setCurrent(video.currentTime);
      setDuration(video.duration || 0);
      setPaused(video.paused);
      setCueText(cuesAtTime(cuesRef.current, video.currentTime - subOffset));
      onProgress?.(video.currentTime, video.duration || 0);
      if (video.videoHeight > 0 && playingHeight === 0) {
        setPlayingHeight(video.videoHeight);
      }
      if (video.videoWidth > 0 && playingWidth === 0) {
        setPlayingWidth(video.videoWidth);
      }
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
    if (videoRef.current) {
      setCueText(cuesAtTime(cuesRef.current, videoRef.current.currentTime - subOffset));
    }
  }, [subOffset]);

  React.useEffect(() => {
    if (didAutoSub.current || allSubtitles.length === 0) return;
    const index = allSubtitles.findIndex(
      (sub) => sub.language === "en" || /^english/i.test(sub.label),
    );
    didAutoSub.current = true;
    setSubId(`ext-${index >= 0 ? index : 0}`);
  }, [allSubtitles]);

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
    const selected = allSubtitles[index];
    if (!selected) {
      cuesRef.current = [];
      setCueText("");
      return;
    }
    // If local uploaded file, cues are already in cuesRef
    if (selected.url === "" && cuesRef.current.length > 0) {
      const seconds = (videoRef.current?.currentTime ?? 0) - subOffset;
      setCueText(cuesAtTime(cuesRef.current, seconds));
      return;
    }
    if (!selected.url) {
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
        const seconds = (videoRef.current?.currentTime ?? 0) - subOffset;
        setCueText(cuesAtTime(cuesRef.current, seconds));
      })
      .catch(() => {
        if (!cancelled) {
          cuesRef.current = [];
          setCueText("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subId, allSubtitles, subOffset]);

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
        if (allSubtitles.length === 0) return;
        setSubId((currentId) => {
          if (currentId === "off") return "ext-0";
          const index = Number(currentId.replace("ext-", ""));
          return index + 1 >= allSubtitles.length ? "off" : `ext-${index + 1}`;
        });
      }
      revealControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allSubtitles.length, revealControls]);

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

  const is4KSource = React.useCallback(
    (dims?: { height?: number; width?: number; url?: string }) => {
      const w = dims?.width || 0;
      const h = dims?.height || 0;
      if (w > 0 || h > 0) {
        if (w >= 3600 || h >= 1900) return true;
        if (w > 0 && h > 0 && w * h >= 5_500_000) return true;
        return false;
      }
      if (dims?.url && (dims.url.includes("2160") || dims.url.includes("/4k") || dims.url.includes("_4k"))) return true;
      if (activeSrc && (activeSrc.includes("2160") || activeSrc.includes("/4k") || activeSrc.includes("_4k"))) return true;
      return false;
    },
    [activeSrc],
  );

  const is1080pSource = React.useCallback(
    (dims?: { height?: number; width?: number; url?: string }) => {
      if (is4KSource(dims)) return false;
      const w = dims?.width || 0;
      const h = dims?.height || 0;
      if (w >= 1800 || h >= 950) return true;
      if (w > 0 && h > 0 && w * h >= 1_800_000) return true;
      if (dims?.url && dims.url.includes("1080")) return true;
      if (activeSrc && activeSrc.includes("1080")) return true;
      return false;
    },
    [is4KSource, activeSrc],
  );

  const applyLevel = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setLevel(index);
    if (index >= 0) {
      const lvl = hls.levels[index];
      if (lvl) {
        setPlayingHeight(lvl.height || 0);
        setPlayingWidth(lvl.width || 0);
      }
    }
    setPanel("none");
  };

  const selectQualityTier = (tier: "auto" | "4k" | "1080p" | "720p" | "480p" | "360p") => {
    setSelectedQualityTier(tier);
    const hls = hlsRef.current;
    const video = videoRef.current;

    if (tier === "auto") {
      if (hls) hls.currentLevel = -1;
      setLevel(-1);
      setPanel("none");
      return;
    }

    if (tier === "4k") {
      if (fourKSrc && activeSrc !== fourKSrc) {
        if (video) switchTimeRef.current = video.currentTime;
        setActiveSrc(fourKSrc);
        setLevel(-1);
        setPanel("none");
        return;
      }
      if (hls && levels.length > 0) {
        const idx = levels.findIndex((l) => is4KSource(l));
        if (idx >= 0) {
          applyLevel(levels[idx]?.index ?? 0);
          return;
        }
        // If no explicit 4K level found, select highest available resolution/bitrate tier
        let bestIdx = -1;
        let maxScore = -1;
        levels.forEach((l, i) => {
          const score = (l.width || 0) * (l.height || 0) || (l.height || 0) * 1000 || (l.bitrate || 0);
          if (score > maxScore) {
            maxScore = score;
            bestIdx = l.index ?? i;
          }
        });
        if (bestIdx >= 0) {
          applyLevel(bestIdx);
          return;
        }
      }
      return;
    }

    // HD tiers: 1080p, 720p, 480p, 360p
    if (
      hdSrc &&
      activeSrc !== hdSrc &&
      is4KSource({ height: playingHeight, width: playingWidth }) &&
      levels.length <= 1
    ) {
      if (video) switchTimeRef.current = video.currentTime;
      setActiveSrc(hdSrc);
      setLevel(-1);
      setPanel("none");
      return;
    }

    if (hls && levels.length > 0) {
      let targetIndex = -1;
      if (tier === "1080p") {
        targetIndex = levels.findIndex(
          (l) => is1080pSource(l) || (l.height >= 950 && l.height < 1440),
        );
        if (targetIndex < 0) {
          let maxScore = -1;
          levels.forEach((l, i) => {
            const score = (l.width || 0) * (l.height || 0) || (l.height || 0);
            if (score > maxScore) {
              maxScore = score;
              targetIndex = l.index ?? i;
            }
          });
        }
      } else if (tier === "720p") {
        targetIndex = levels.findIndex((l) => l.height >= 650 && l.height < 950);
      } else if (tier === "480p") {
        targetIndex = levels.findIndex((l) => l.height >= 400 && l.height < 650);
      } else if (tier === "360p") {
        targetIndex = levels.findIndex((l) => l.height > 0 && l.height < 400);
      }
      if (targetIndex >= 0) {
        applyLevel(levels[targetIndex]?.index ?? 0);
        return;
      }
      // If requested tier not matched, find closest tier rather than potato level 0
      let fallbackIdx = 0;
      let minDiff = Infinity;
      const targetHeight = tier === "720p" ? 720 : tier === "480p" ? 480 : 360;
      levels.forEach((l, i) => {
        const diff = Math.abs((l.height || 0) - targetHeight);
        if (diff < minDiff) {
          minDiff = diff;
          fallbackIdx = l.index ?? i;
        }
      });
      applyLevel(fallbackIdx);
      return;
    }
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
    if (selectedQualityTier === "auto") {
      const activeLevel = level >= 0 ? levels[level] : undefined;
      const currentDims = activeLevel
        ? { height: activeLevel.height, width: activeLevel.width, url: (activeLevel as { url?: string })?.url }
        : { height: playingHeight, width: playingWidth };

      if (is4KSource(currentDims) || (levels.length > 0 && levels.some((lvl) => is4KSource(lvl)))) {
        return "Auto (4K)";
      }
      if (is1080pSource(currentDims) || (levels.length > 0 && levels.some((lvl) => is1080pSource(lvl)))) {
        return "Auto (1080p)";
      }
      if (playingHeight > 0) return `Auto (${playingHeight}p)`;
      if (is4KHint) return "Auto (4K)";
      return "Auto";
    }

    if (selectedQualityTier === "4k") return "4K";
    if (selectedQualityTier === "1080p") return "1080p";
    if (selectedQualityTier === "720p") return "720p";
    if (selectedQualityTier === "480p") return "480p";
    if (selectedQualityTier === "360p") return "360p";
    return "Auto";
  }, [selectedQualityTier, level, levels, playingHeight, playingWidth, is4KSource, is1080pSource, is4KHint]);

  const activeLevel = level >= 0 ? levels[level] : undefined;
  const currentQualityDims = activeLevel
    ? { height: activeLevel.height, width: activeLevel.width }
    : { height: playingHeight, width: playingWidth };
  const lisbon4k =
    is4KHint &&
    (playingHeight >= 2000 || playingWidth >= 3500) &&
    (is4KSource(currentQualityDims) ||
      levels.some((lvl) => is4KSource({ height: lvl.height, width: lvl.width, url: (lvl as { url?: string })?.url })));

  const activeSub =
    subId === "off"
      ? "Off"
      : allSubtitles[Number(subId.replace("ext-", ""))]?.label || "On";

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
      <div className="absolute inset-0 z-0">
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
                    } else if (allSubtitles.length > 0) {
                      const idx = allSubtitles.findIndex((s) => s.language === "en" || /english/i.test(s.label));
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
                    playingHeight > 0 || playingWidth > 0
                      ? is4KSource({ height: playingHeight, width: playingWidth })
                        ? "4K (2160p) · Current"
                        : is1080pSource({ height: playingHeight, width: playingWidth })
                          ? "1080p Full HD · Current"
                          : `${playingHeight}p · Current`
                      : is4KHint
                        ? "4K (2160p) · Ultra HD"
                        : "Optimal",
                  active: selectedQualityTier === "auto",
                  onSelect: () => selectQualityTier("auto"),
                },
                {
                  key: "4k",
                  label: "4K",
                  sublabel: "2160p Ultra HD",
                  active: selectedQualityTier === "4k",
                  onSelect: () => selectQualityTier("4k"),
                },
                {
                  key: "1080p",
                  label: "1080p",
                  sublabel: "Full HD",
                  active: selectedQualityTier === "1080p",
                  onSelect: () => selectQualityTier("1080p"),
                },
                {
                  key: "720p",
                  label: "720p",
                  sublabel: "HD",
                  active: selectedQualityTier === "720p",
                  onSelect: () => selectQualityTier("720p"),
                },
                {
                  key: "480p",
                  label: "480p",
                  sublabel: "SD",
                  active: selectedQualityTier === "480p",
                  onSelect: () => selectQualityTier("480p"),
                },
                {
                  key: "360p",
                  label: "360p",
                  sublabel: "SD",
                  active: selectedQualityTier === "360p",
                  onSelect: () => selectQualityTier("360p"),
                },
              ]}
            />
          ) : null}

          {panel === "subs" ? (
            <SubtitlesPanel
              subId={subId}
              onSelectSub={(id) => {
                setSubId(id);
              }}
              onClose={() => setPanel("none")}
              onBack={() => setPanel("settings")}
              externalSubtitles={allSubtitles}
              subOffset={subOffset}
              onChangeOffset={(delta) => setSubOffset((prev) => Math.round((prev + delta) * 10) / 10)}
              onResetOffset={() => setSubOffset(0)}
              onUploadFile={(file) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const text = reader.result as string;
                  if (!text) return;
                  const cues = parseSubtitleCues(text);
                  cuesRef.current = cues;
                  const seconds = (videoRef.current?.currentTime ?? 0) - subOffset;
                  setCueText(cuesAtTime(cues, seconds));
                  const newCustom: ExternalSubtitle = {
                    label: file.name.replace(/\.(srt|vtt|ass|sub)$/i, ""),
                    language: "en",
                    url: "",
                    isExternal: true,
                  };
                  setCustomSubtitles((prev) => [newCustom, ...prev]);
                  setSubId("ext-0");
                };
                reader.readAsText(file);
              }}
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


interface SubtitlesPanelProps {
  subId: string;
  onSelectSub: (id: string) => void;
  onClose: () => void;
  onBack?: () => void;
  externalSubtitles: ExternalSubtitle[];
  subOffset: number;
  onChangeOffset: (delta: number) => void;
  onResetOffset: () => void;
  onUploadFile: (file: File) => void;
}

function SubtitlesPanel({
  subId,
  onSelectSub,
  onClose,
  onBack,
  externalSubtitles,
  subOffset,
  onChangeOffset,
  onResetOffset,
  onUploadFile,
}: SubtitlesPanelProps) {
  const [drillLang, setDrillLang] = React.useState<string | null>(null);
  const [timingOpen, setTimingOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Group subtitles by language
  const groups = React.useMemo(() => {
    const map = new Map<
      string,
      {
        langCode: string;
        langName: string;
        flag: string;
        items: { sub: ExternalSubtitle; globalIndex: number }[];
      }
    >();

    externalSubtitles.forEach((sub, index) => {
      const rawLang = (sub.language || "").toLowerCase();
      const norm = NORM_LANG[rawLang] || rawLang || "en";
      const langName = LANG_NAMES[norm] || sub.language || "Unknown";
      const flag = LANG_FLAGS[norm] || "🌐";

      if (!map.has(norm)) {
        map.set(norm, {
          langCode: norm,
          langName,
          flag,
          items: [],
        });
      }
      map.get(norm)!.items.push({ sub, globalIndex: index });
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.langCode === "en") return -1;
      if (b.langCode === "en") return 1;
      return a.langName.localeCompare(b.langName);
    });
  }, [externalSubtitles]);

  // View 1: Timing / Audio Sync adjustment
  if (timingOpen) {
    return (
      <div className="flex max-h-[60vh] sm:max-h-[500px] w-80 sm:w-96 flex-col select-none">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTimingOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-xs font-bold tracking-wider uppercase text-white/90">
              Sync Subtitle to Audio
            </p>
          </div>
          <span className="text-[11px] font-mono text-white/40">Timing</span>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-col items-center justify-center py-4 bg-white/[0.04] rounded-2xl border border-white/[0.08]">
            <span className="text-3xl font-mono font-bold tracking-tight text-white">
              {subOffset > 0 ? `+${subOffset.toFixed(1)}s` : `${subOffset.toFixed(1)}s`}
            </span>
            <span className="text-xs text-white/50 mt-1">
              {subOffset === 0
                ? "Subtitles in default sync"
                : subOffset > 0
                ? "Subtitles appear earlier (+)"
                : "Subtitles appear later (-)"}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                onClick={() => onChangeOffset(-1)}
                className="flex-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 py-2 text-xs font-mono font-semibold text-white transition-all border border-white/[0.06]"
              >
                -1.0s
              </button>
              <button
                type="button"
                onClick={() => onChangeOffset(-0.5)}
                className="flex-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 py-2 text-xs font-mono font-semibold text-white transition-all border border-white/[0.06]"
              >
                -0.5s
              </button>
              <button
                type="button"
                onClick={() => onChangeOffset(-0.1)}
                className="flex-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 py-2 text-xs font-mono font-semibold text-white transition-all border border-white/[0.06]"
              >
                -0.1s
              </button>
              <button
                type="button"
                onClick={() => onChangeOffset(0.1)}
                className="flex-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 py-2 text-xs font-mono font-semibold text-white transition-all border border-white/[0.06]"
              >
                +0.1s
              </button>
              <button
                type="button"
                onClick={() => onChangeOffset(0.5)}
                className="flex-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 py-2 text-xs font-mono font-semibold text-white transition-all border border-white/[0.06]"
              >
                +0.5s
              </button>
              <button
                type="button"
                onClick={() => onChangeOffset(1)}
                className="flex-1 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] active:scale-95 py-2 text-xs font-mono font-semibold text-white transition-all border border-white/[0.06]"
              >
                +1.0s
              </button>
            </div>

            <button
              type="button"
              onClick={onResetOffset}
              disabled={subOffset === 0}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-40 disabled:pointer-events-none py-2 text-xs font-medium text-white/80 transition-all border border-white/[0.06]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset to 0.0s</span>
            </button>
          </div>

          <p className="text-[11px] text-white/40 text-center leading-relaxed">
            Adjust subtitle offset to match dialogue if the track starts earlier or later.
          </p>
        </div>
      </div>
    );
  }

  // View 2: Drilled into a specific language (e.g. English, Portuguese, etc.)
  if (drillLang) {
    const group = groups.find((g) => g.langCode === drillLang);
    const rawItems = group?.items || [];
    const q = search.trim().toLowerCase();
    const filteredItems = q
      ? rawItems.filter(
          (item) =>
            item.sub.label.toLowerCase().includes(q) ||
            item.sub.language.toLowerCase().includes(q),
        )
      : rawItems;

    return (
      <div className="flex max-h-[60vh] sm:max-h-[500px] w-80 sm:w-96 flex-col select-none">
        <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                setDrillLang(null);
                setSearch("");
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-base shrink-0">{group?.flag}</span>
            <p className="text-xs font-bold tracking-wider uppercase text-white/90 truncate">
              {group?.langName || "Language"}
            </p>
          </div>
          <span className="text-[11px] font-mono text-white/40 shrink-0 ml-2">
            {rawItems.length} options
          </span>
        </div>

        {rawItems.length > 5 && (
          <div className="p-2 border-b border-white/[0.06]">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-3.5 w-3.5 text-white/40" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search releases (1080p, IMAX, YIFY...)"
                className="w-full rounded-xl bg-white/[0.06] border border-white/[0.08] pl-8 pr-7 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 text-white/40 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="overflow-y-auto py-1.5 px-2 space-y-1 scrollbar-thin">
          {filteredItems.map((item) => {
            const active = subId === `ext-${item.globalIndex}`;
            return (
              <button
                key={item.globalIndex}
                type="button"
                className={cn(
                  "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-150",
                  active
                    ? "bg-white/[0.12] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] border border-white/[0.1]"
                    : "text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent active:scale-[0.98]",
                )}
                onClick={() => {
                  onSelectSub(`ext-${item.globalIndex}`);
                }}
              >
                <div className="flex flex-col items-start min-w-0 pr-2">
                  <span className="text-xs font-medium tracking-wide text-white truncate max-w-[210px] sm:max-w-[250px]" title={item.sub.label}>
                    {item.sub.label}
                  </span>
                  {item.sub.isExternal ? (
                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-white/[0.08] text-[9px] font-mono tracking-wider text-white/50 uppercase border border-white/[0.06]">
                      EXTERNAL
                    </span>
                  ) : null}
                </div>
                {active ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 fill-emerald-400/20 shrink-0 ml-1.5" />
                ) : null}
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <p className="py-6 text-center text-xs text-white/40">No releases found matching "{search}"</p>
          )}
        </div>
      </div>
    );
  }

  // View 3: Main Subtitles menu (Matches Cinejoy Screenshot 2)
  const q = search.trim().toLowerCase();
  const filteredGroups = q
    ? groups.filter(
        (g) =>
          g.langName.toLowerCase().includes(q) ||
          g.langCode.toLowerCase().includes(q) ||
          g.items.some((i) => i.sub.label.toLowerCase().includes(q)),
      )
    : groups;

  return (
    <div className="flex max-h-[60vh] sm:max-h-[500px] w-80 sm:w-96 flex-col select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt,.ass,.sub"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadFile(file);
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
              aria-label="Back"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          <p className="text-xs font-bold tracking-wider uppercase text-white/90">Subtitles</p>
        </div>
        <span className="text-[11px] font-mono text-white/40">Options</span>
      </div>

      {/* Top Actions: Off, Upload, Sync */}
      <div className="p-2 border-b border-white/[0.06] space-y-1">
        {/* Off Option */}
        <button
          type="button"
          onClick={() => {
            onSelectSub("off");
            onClose();
          }}
          className={cn(
            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-150",
            subId === "off"
              ? "bg-white/[0.12] text-white border border-white/[0.1]"
              : "text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent active:scale-[0.98]",
          )}
        >
          <span className="text-sm font-semibold tracking-wide text-white">Off</span>
          {subId === "off" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 fill-emerald-400/20 shrink-0" />
          ) : null}
        </button>

        {/* Upload Subtitle File */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent transition-all duration-150 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2.5">
            <Upload className="h-4 w-4 text-white/60" />
            <span className="text-xs font-medium tracking-wide text-white/90">Upload subtitle file</span>
          </div>
          <span className="text-[10px] font-mono text-white/40 uppercase">SRT / VTT</span>
        </button>

        {/* Sync Subtitle to Audio */}
        <button
          type="button"
          onClick={() => setTimingOpen(true)}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent transition-all duration-150 active:scale-[0.98]"
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="h-4 w-4 text-white/60" />
            <span className="text-xs font-medium tracking-wide text-white/90">Sync subtitle to audio</span>
          </div>
          <div className="flex items-center gap-1">
            {subOffset !== 0 ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                {subOffset > 0 ? `+${subOffset.toFixed(1)}s` : `${subOffset.toFixed(1)}s`}
              </span>
            ) : null}
            <ChevronRight className="h-4 w-4 text-white/40" />
          </div>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-2 border-b border-white/[0.06]">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-3.5 w-3.5 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search languages or releases..."
            className="w-full rounded-xl bg-white/[0.06] border border-white/[0.08] pl-8 pr-7 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/20 focus:bg-white/[0.08]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 text-white/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grouped Languages List */}
      <div className="overflow-y-auto py-1.5 px-2 space-y-1 scrollbar-thin">
        {filteredGroups.map((group) => {
          const count = group.items.length;
          const hasMultiple = count > 1;
          const isSingleActive =
            !hasMultiple && subId === `ext-${group.items[0]?.globalIndex}`;
          const isAnyInGroupActive = group.items.some(
            (i) => subId === `ext-${i.globalIndex}`,
          );

          return (
            <button
              key={group.langCode}
              type="button"
              className={cn(
                "group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-all duration-150",
                isSingleActive || isAnyInGroupActive
                  ? "bg-white/[0.1] text-white border border-white/[0.1]"
                  : "text-white/80 hover:bg-white/[0.06] hover:text-white border border-transparent active:scale-[0.98]",
              )}
              onClick={() => {
                if (hasMultiple) {
                  setDrillLang(group.langCode);
                  setSearch("");
                } else if (group.items[0]) {
                  onSelectSub(`ext-${group.items[0].globalIndex}`);
                }
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <span className="text-base shrink-0">{group.flag}</span>
                <span className="text-xs font-semibold tracking-wide text-white truncate">
                  {group.langName}
                </span>
                {!hasMultiple ? (
                  <span className="px-1.5 py-0.2 rounded bg-white/[0.08] text-[9px] font-mono text-white/50 uppercase border border-white/[0.06]">
                    EXTERNAL
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {hasMultiple ? (
                  <>
                    <span className="text-xs font-mono font-medium text-white/70">
                      {count}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/40 transition-transform group-hover:translate-x-0.5" />
                  </>
                ) : isSingleActive ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 fill-emerald-400/20" />
                ) : null}
              </div>
            </button>
          );
        })}
        {filteredGroups.length === 0 && (
          <p className="py-6 text-center text-xs text-white/40">No subtitles found matching "{search}"</p>
        )}
      </div>
    </div>
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
