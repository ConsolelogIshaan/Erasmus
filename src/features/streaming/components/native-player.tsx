"use client";

import * as React from "react";
import Hls from "hls.js";
import {
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

import { Button } from "@/components/ui/button";
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

interface NativePlayerProps {
  src: string;
  startAt?: number;
  kind?: "hls" | "file";
  serverId?: string;
  externalSubtitles?: ExternalSubtitle[];
  onToggleFullscreen?: () => void;
  onProgress?: (seconds: number, duration: number) => void;
}

type Panel = "none" | "settings" | "subs" | "audio" | "quality";

export function NativePlayer({
  src,
  startAt = 0,
  kind = "hls",
  serverId,
  externalSubtitles = [],
  onToggleFullscreen,
  onProgress,
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
  const [showBar, setShowBar] = React.useState(true);
  const didAutoSub = React.useRef(false);

  const revealBar = React.useCallback(() => {
    setShowBar(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setShowBar(false);
    }, 2800);
  }, []);

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
      revealBar();
    };
    const onPause = () => {
      setPaused(true);
      setShowBar(true);
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("play", onTime);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWait);
    video.addEventListener("playing", onPlay);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("play", onTime);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWait);
      video.removeEventListener("playing", onPlay);
    };
  }, [onProgress, revealBar]);

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
    const onMove = () => revealBar();
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, [revealBar]);

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
      revealBar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [externalSubtitles.length, revealBar]);

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

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute inset-0 z-[1] bg-black",
        showBar || panel !== "none" ? "cursor-auto" : "cursor-none",
      )}
      onMouseMove={revealBar}
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
      {cueText ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-28 z-[80] flex justify-center px-6"
          style={{ zIndex: 80 }}
        >
          <p className="max-w-4xl whitespace-pre-line rounded-md bg-black/80 px-4 py-1.5 text-center text-lg font-semibold leading-snug text-white sm:text-2xl">
            {cueText}
          </p>
        </div>
      ) : null}
      {buffering ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
        </div>
      ) : null}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-[100] bg-gradient-to-t from-black via-black/85 to-transparent px-4 pb-5 pt-14 text-white transition-transform duration-200",
          showBar || panel !== "none"
            ? "translate-y-0"
            : "translate-y-full pointer-events-none",
        )}
        style={{ zIndex: 100, color: "#fff" }}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          value={Math.min(current, duration || 0)}
          onChange={(event) => seekTo(Number(event.target.value))}
          className="mb-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
          aria-label="Seek"
        />
        <div className="flex items-center gap-1.5 text-white [&_svg]:text-white">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-white hover:bg-white/15 active:scale-[0.97]"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (video.paused) video.play().catch(() => {});
              else video.pause();
            }}
            title={paused ? "Play" : "Pause"}
          >
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0 text-white hover:bg-white/15"
            onClick={() => seekTo(current - 10)}
            title="Back 10 seconds"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center pt-0.5 text-[8px] font-bold">
              10
            </span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="relative h-9 w-9 p-0 text-white hover:bg-white/15"
            onClick={() => seekTo(current + 10)}
            title="Forward 10 seconds"
          >
            <RotateCw className="h-5 w-5" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center pt-0.5 text-[8px] font-bold">
              10
            </span>
          </Button>
          <span className="px-2 font-mono text-xs text-white/80">
            {formatTimecode(current)} / {formatTimecode(duration)}
          </span>
          <button
            type="button"
            className="ml-1 flex items-center gap-1"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              video.muted = !video.muted;
              setMuted(video.muted);
            }}
            title={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4 text-white/80" />
            ) : (
              <Volume2 className="h-4 w-4 text-white/80" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              const video = videoRef.current;
              setVolume(next);
              setMuted(next === 0);
              if (video) {
                video.volume = next;
                video.muted = next === 0;
              }
            }}
            className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-white/20 accent-primary"
            aria-label="Volume"
          />
          <span className="flex-1" />
          <span className="hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-white/70 sm:inline">
            {qualityLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 w-9 p-0 hover:bg-white/15",
              subId !== "off" ? "text-primary" : "text-white",
            )}
            onClick={() => setPanel(panel === "subs" ? "none" : "subs")}
            title="Subtitles"
          >
            <Subtitles className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-white hover:bg-white/15"
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
            title="Settings"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-white hover:bg-white/15"
            onClick={() => {
              const video = videoRef.current;
              if (!video) return;
              if (document.pictureInPictureElement) {
                document.exitPictureInPicture?.().catch(() => {});
              } else {
                video.requestPictureInPicture?.().catch(() => {});
              }
            }}
            title="Picture in picture"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-white hover:bg-white/15"
            onClick={() => onToggleFullscreen?.()}
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {panel !== "none" ? (
        <div
          className="absolute bottom-24 right-4 z-[110] max-h-[50vh] w-64 overflow-y-auto rounded-xl border border-white/20 bg-black py-1 text-white shadow-2xl"
          style={{ zIndex: 110, background: "#111", color: "#fff" }}
          onClick={(event) => event.stopPropagation()}
        >
          {panel === "settings" ? (
            <>
              <MenuRow
                label="Quality"
                value={qualityLabel}
                onClick={() => setPanel("quality")}
              />
              <MenuRow
                label="Speed"
                value={`${speed}x`}
                onClick={() => {
                  const next = speed === 1 ? 1.25 : speed === 1.25 ? 1.5 : speed === 1.5 ? 2 : 1;
                  setSpeed(next);
                  if (videoRef.current) videoRef.current.playbackRate = next;
                }}
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
            </>
          ) : null}
          {panel === "quality" ? (
            <>
              <button
                type="button"
                className={cn(
                  "block w-full px-3 py-2 text-left text-xs hover:bg-white/10",
                  level < 0 ? "text-primary" : "text-white/80",
                )}
                onClick={() => applyLevel(-1)}
              >
                Auto
              </button>
              {[...levels]
                .sort((a, b) => b.height - a.height)
                .map((item) => (
                  <button
                    key={item.index}
                    type="button"
                    className={cn(
                      "block w-full px-3 py-2 text-left text-xs hover:bg-white/10",
                      level === item.index ? "text-primary" : "text-white/80",
                    )}
                    onClick={() => applyLevel(item.index)}
                  >
                    {item.height}p
                  </button>
                ))}
            </>
          ) : null}
          {panel === "audio" ? (
            audioTracks.map((track) => (
              <button
                key={track.index}
                type="button"
                className={cn(
                  "block w-full px-3 py-2 text-left text-xs hover:bg-white/10",
                  audio === track.index ? "text-primary" : "text-white/80",
                )}
                onClick={() => applyAudio(track.index)}
              >
                {track.name}
              </button>
            ))
          ) : null}
          {panel === "subs" ? (
            <>
              <button
                type="button"
                className={cn(
                  "block w-full px-3 py-2 text-left text-xs hover:bg-white/10",
                  subId === "off" ? "text-primary" : "text-white/80",
                )}
                onClick={() => {
                  setSubId("off");
                  setPanel("none");
                }}
              >
                Off
              </button>
              {externalSubtitles.map((sub, index) => (
                <button
                  key={`${sub.language}-${index}`}
                  type="button"
                  className={cn(
                    "block w-full px-3 py-2 text-left text-xs hover:bg-white/10",
                    subId === `ext-${index}` ? "text-primary" : "text-white/80",
                  )}
                  onClick={() => {
                    setSubId(`ext-${index}`);
                    setPanel("none");
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
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
      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-white/90 hover:bg-white/10"
      onClick={onClick}
    >
      <span>{label}</span>
      <span className="text-white/50">{value}</span>
    </button>
  );
}
