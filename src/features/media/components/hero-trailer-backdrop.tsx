"use client";

import * as React from "react";
import Image from "next/image";
import { Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";
import { backdropUrl } from "@/lib/media/image";
import type { MediaVideo } from "@/types/media";

interface HeroTrailerBackdropProps {
  videos: MediaVideo[];
  backdropPath?: string | null;
  posterPath?: string | null;
  title: string;
  className?: string;
}

/** Minimal YouTube IFrame API surface we use. */
interface YtPlayer {
  destroy: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted?: () => boolean;
  setVolume?: (volume: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
}

interface YtPlayerEvent {
  data: number;
  target: YtPlayer;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: YtPlayerEvent) => void;
            onStateChange?: (e: YtPlayerEvent) => void;
            onError?: (e: YtPlayerEvent) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function pickPreferredTrailer(videos: MediaVideo[]): MediaVideo | undefined {
  const youtube = videos.filter((v) => v.site === "YouTube" && v.key);
  return (
    youtube.find((v) => v.type === "Trailer" && v.official) ??
    youtube.find((v) => v.type === "Trailer") ??
    youtube.find((v) => v.type === "Teaser") ??
    youtube.find((v) => v.type === "Clip") ??
    youtube[0]
  );
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      resolve();
    };

    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const start = Date.now();
      const tick = () => {
        if (window.YT?.Player) resolve();
        else if (Date.now() - start > 8000) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  });

  return youtubeApiPromise;
}

/**
 * Full-bleed cinematic trailer stage with edge-to-edge seamless blending.
 * Brighter video presentation with directional text contrast scrims and smooth dissolutions.
 */
export function HeroTrailerBackdrop({
  videos,
  backdropPath,
  posterPath,
  className,
}: HeroTrailerBackdropProps) {
  const trailer = React.useMemo(() => pickPreferredTrailer(videos), [videos]);
  const still = backdropUrl(backdropPath ?? posterPath, "w1280");

  const hostRef = React.useRef<HTMLDivElement>(null);
  const playerRef = React.useRef<YtPlayer | null>(null);

  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [muted, setMuted] = React.useState(true);

  const toggleMute = React.useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!playerRef.current) return;
    try {
      if (muted) {
        playerRef.current.unMute();
        if (playerRef.current.setVolume) {
          playerRef.current.setVolume(100);
        }
        setMuted(false);
      } else {
        playerRef.current.mute();
        setMuted(true);
      }
    } catch {
      // ignore
    }
  }, [muted]);

  React.useEffect(() => {
    if (!trailer || !hostRef.current) return;

    let cancelled = false;
    let player: YtPlayer | null = null;
    let playTimer: ReturnType<typeof setTimeout> | null = null;
    let hasRevealed = false;

    const mount = async () => {
      try {
        await loadYouTubeApi();
        if (cancelled || !hostRef.current || !window.YT?.Player) {
          if (!cancelled) setFailed(true);
          return;
        }

        hostRef.current.innerHTML = "";
        const mountEl = document.createElement("div");
        mountEl.style.width = "100%";
        mountEl.style.height = "100%";
        hostRef.current.appendChild(mountEl);

        player = new window.YT.Player(mountEl, {
          videoId: trailer.key,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            mute: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            start: 2,
            cc_load_policy: 0,
            showinfo: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              try {
                e.target.mute();
                e.target.playVideo();
                try { e.target.playVideo(); } catch {}
              } catch {
                // ignore
              }
            },
            onStateChange: (e) => {
              if (cancelled || !window.YT) return;
              const { PLAYING, ENDED } = window.YT.PlayerState;
              if (e.data === PLAYING) {
                setFailed(false);
                // Keep the still backdrop visible while YouTube flashes its initial play HUD (~1.8s)
                if (!hasRevealed) {
                  if (playTimer) clearTimeout(playTimer);
                  playTimer = setTimeout(() => {
                    if (!cancelled) {
                      hasRevealed = true;
                      setPlaying(true);
                    }
                  }, 3200);
                } else {
                  setPlaying(true);
                }
              } else if (e.data === ENDED) {
                try {
                  e.target.seekTo?.(0, true);
                  e.target.playVideo();
                } catch {
                  // ignore
                }
              }
            },
            onError: () => {
              if (!cancelled) {
                setFailed(true);
                setPlaying(false);
              }
            },
          },
        });
        playerRef.current = player;
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    void mount();

    return () => {
      cancelled = true;
      if (playTimer) clearTimeout(playTimer);
      try {
        player?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [trailer]);

  return (
    <div className={cn("absolute inset-0 bg-transparent pointer-events-none", className)}>
      {/* 1. Masked video stage and still backdrop */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 62%, transparent 100%)",
        }}
      >
        {/* Still backdrop poster with brightness boost & organic feather into ambient atmosphere */}
        {still ? (
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-[1.2s] ease-out",
              playing && !failed ? "opacity-0" : "opacity-100",
            )}
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, black 75%, transparent 100%)",
              maskImage:
                "linear-gradient(to bottom, black 0%, black 75%, transparent 100%)",
            }}
          >
            <Image
              src={still}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover filter brightness-[1.08] contrast-[1.03] saturate-[1.05]"
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-muted/20" />
        )}

        {/* YouTube Trailer Stage with edge feathering and vivid color tuning */}
        {trailer && !failed ? (
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-[1.2s] ease-out",
              playing ? "opacity-100" : "opacity-0",
            )}
            aria-hidden
          >
            {/* Oversized crop removes YouTube branding and edge controls */}
            <div
              className="absolute left-1/2 top-1/2 h-[max(120%,67.5vw)] w-[max(120%,213vh)] -translate-x-1/2 -translate-y-1/2 scale-[1.18] filter brightness-[1.08] contrast-[1.03] saturate-[1.05]"
              style={{
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
                maskImage:
                  "linear-gradient(to bottom, black 0%, black 72%, transparent 100%)",
              }}
            >
              <div
                ref={hostRef}
                className="pointer-events-none h-full w-full overflow-hidden [&_iframe]:pointer-events-none [&_iframe]:absolute [&_iframe]:left-0 [&_iframe]:top-0 [&_iframe]:!h-full [&_iframe]:!w-full"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 bg-transparent" />
          </div>
        ) : null}

        {/*
          CINEMATIC SEAMLESS BLENDING GRADIENTS:
          Replaces muddy dark overlays with targeted directional scrims that preserve video brightness.
        */}

        {/* 1. Translucent Left-to-Right contrast fade: soft legibility scrim */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, rgba(7,9,12,0.55) 0%, rgba(7,9,12,0.38) 22%, rgba(7,9,12,0.15) 42%, transparent 68%)",
          }}
        />

        {/* 2. Soft localized text contrast accent (subtle, non-muddy) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 65% 75% at 10% 70%, hsl(var(--background) / 0.5) 0%, hsl(var(--background) / 0.2) 40%, transparent 70%)",
          }}
        />

        {/* 3. Soft top gradient under navigation header */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 sm:h-32"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.25) 45%, transparent 100%)",
          }}
        />

        {/* 4. Subtle right-edge feather for ultra-wide displays */}
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-24 sm:w-40"
          style={{
            background:
              "linear-gradient(to left, hsl(var(--background) / 0.35) 0%, transparent 100%)",
          }}
        />
      </div>

      {/* 2. Sleek Floating Audio Mute/Unmute Control - Outside mask, z-30, pointer-events-auto */}
      {trailer && !failed && playing ? (
        <div className="pointer-events-auto absolute bottom-8 right-6 sm:right-10 z-30 flex items-center">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute trailer" : "Mute trailer"}
            title={muted ? "Unmute trailer" : "Mute trailer"}
            className="group flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white/90 backdrop-blur-xl transition-all duration-200 hover:scale-110 hover:border-white/40 hover:bg-black/80 hover:text-white active:scale-95 shadow-[0_4px_20px_rgba(0,0,0,0.5)] cursor-pointer"
          >
            {muted ? (
              <VolumeX className="h-5 w-5 transition-transform group-hover:scale-105" />
            ) : (
              <Volume2 className="h-5 w-5 text-primary transition-transform group-hover:scale-105" />
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
