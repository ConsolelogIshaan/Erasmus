"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Info, Sparkles, Star } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { backdropUrl, logoUrl } from "@/lib/media/image";
import { formatVote, formatYear } from "@/lib/media/format";
import { mediaHref } from "@/lib/media/routes";
import type { MediaSummary } from "@/types/media";
import { useAmbient } from "@/providers/ambient-provider";
import type { AmbientPalette } from "@/lib/media/ambient-palette-types";

export type HeroBannerMediaItem = MediaSummary & {
  ambientPalette?: AmbientPalette;
  ambientBackdropUrl?: string | null;
};

interface HeroBannerProps {
  /** Rotating featured titles (trending etc.). */
  items: HeroBannerMediaItem[];
  /** Legacy single-item support. */
  item?: HeroBannerMediaItem;
  /** Auto-advance interval in ms (default 6s). */
  intervalMs?: number;
  ctaHref?: string;
}

/**
 * Grand cinematic full-bleed discovery hero moving panel.
 * Features synchronized ambient atmosphere blending, silky Ken Burns backdrop crossfades,
 * gentle optical de-blurring title motion, and liquid countdown progress pills.
 */
export function HeroBanner({
  items,
  item,
  intervalMs = 6000,
  ctaHref,
}: HeroBannerProps) {
  const reduceMotion = useReducedMotion();
  const { setAmbientTheme } = useAmbient();
  const slides = React.useMemo(() => {
    const list = items.length ? items : item ? [item] : [];
    const withArt = list.filter((i) => i.backdropPath || i.posterPath);
    return (withArt.length ? withArt : list).slice(0, 10);
  }, [items, item]);

  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [failedLogos, setFailedLogos] = React.useState<Record<string, boolean>>({});
  const [detailsCache, setDetailsCache] = React.useState<
    Record<string, { logoPath: string | null; tagline: string | null }>
  >({});

  const go = React.useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length]
  );

  // Fallback auto-advance for reduceMotion mode
  React.useEffect(() => {
    if (!reduceMotion || slides.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [reduceMotion, slides.length, paused, intervalMs]);

  const active = slides[index] ?? slides[0];

  // Synchronize Page-Level Ambient Background with active carousel slide
  React.useEffect(() => {
    if (!active) return;
    const imgPath = active.backdropPath ?? active.posterPath;
    const backdrop = active.ambientBackdropUrl ?? backdropUrl(imgPath, "w1280");
    setAmbientTheme({
      palette: active.ambientPalette,
      backdropUrl: backdrop,
      id: "discover-" + active.mediaType + "-" + active.id,
    });
  }, [active, setAmbientTheme]);

  // Preload all backdrop images and logos immediately in browser memory
  React.useEffect(() => {
    if (!slides.length || typeof window === "undefined") return;
    slides.forEach((slide) => {
      // 1. Preload high-res backdrops
      const imgPath = slide.backdropPath ?? slide.posterPath;
      if (imgPath) {
        const bg1 = backdropUrl(imgPath, "original");
        const bg2 = backdropUrl(imgPath, "w1280");
        if (bg1) {
          const img = new window.Image();
          img.src = bg1;
        }
        if (bg2 && bg2 !== bg1) {
          const img = new window.Image();
          img.src = bg2;
        }
      }

      // 2. Preload logos
      const key = `${slide.mediaType}:${slide.id}`;
      const activeDetails = detailsCache[key];
      const logoPath = activeDetails?.logoPath ?? slide.logoPath;
      if (logoPath) {
        const url = logoUrl(logoPath, "w500");
        if (url) {
          const img = new window.Image();
          img.src = url;
        }
      }

      // 3. Details fetch if logo not yet known
      if (detailsCache[key] !== undefined || slide.logoPath) return;
      fetch(`/api/media/details?type=${slide.mediaType}&id=${slide.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.logoPath) {
            const url = logoUrl(data.logoPath, "w500");
            if (url) {
              const img = new window.Image();
              img.src = url;
            }
          }
          setDetailsCache((prev) => ({
            ...prev,
            [key]: {
              logoPath: data.logoPath ?? null,
              tagline: data.tagline ?? null,
            },
          }));
        })
        .catch(() => {});
    });
  }, [slides, detailsCache]);

  // Fetch logo/tagline for active slide if not already cached
  React.useEffect(() => {
    if (!active) return;
    const key = `${active.mediaType}:${active.id}`;
    if (detailsCache[key] !== undefined) return;

    let isCancelled = false;
    fetch(`/api/media/details?type=${active.mediaType}&id=${active.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled || !data) return;
        setDetailsCache((prev) => ({
          ...prev,
          [key]: {
            logoPath: data.logoPath ?? null,
            tagline: data.tagline ?? null,
          },
        }));
      })
      .catch(() => {
        if (!isCancelled) {
          setDetailsCache((prev) => ({
            ...prev,
            [key]: { logoPath: null, tagline: null },
          }));
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [active, detailsCache]);

  if (!active) return null;

  const activeKey = `${active.mediaType}:${active.id}`;
  const activeDetails = detailsCache[activeKey];
  const activeLogoPath = activeDetails?.logoPath ?? active.logoPath ?? null;
  const activeTagline = activeDetails?.tagline ?? active.tagline ?? null;
  const logo = !failedLogos[activeKey] && activeLogoPath ? logoUrl(activeLogoPath, "w500") : null;

  const href = ctaHref ?? mediaHref(active.mediaType, active.id);
  const bg =
    backdropUrl(active.backdropPath ?? active.posterPath, "original") ??
    backdropUrl(active.backdropPath ?? active.posterPath, "w1280");
  const year = formatYear(active.releaseDate);

  return (
    <section
      className="relative w-full overflow-hidden min-h-[min(94vh,64rem)] flex flex-col justify-end select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes heroProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      ` }} />

      {/* -------------------------------------------------------------
          EXPANSIVE FULL-BLEED BACKDROP STAGE WITH SWEET, SILKY SCRIMS
         ------------------------------------------------------------- */}
      <div
        className="absolute inset-0 overflow-hidden bg-transparent"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
        }}
      >
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`bg-${active.mediaType}-${active.id}`}
            className="absolute inset-0 will-change-transform"
            style={{
              WebkitMaskImage:
                "linear-gradient(to bottom, black 0%, black 78%, transparent 100%)",
              maskImage:
                "linear-gradient(to bottom, black 0%, black 78%, transparent 100%)",
            }}
            initial={reduceMotion ? false : { opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
            transition={{
              opacity: { duration: 1.4, ease: [0.22, 1, 0.36, 1] },
              scale: { duration: 1.8, ease: [0.16, 1, 0.3, 1] },
            }}
          >
            {bg ? (
              <Image
                src={bg}
                alt=""
                fill
                priority={true}
                sizes="100vw"
                className="object-cover object-top sm:object-center filter brightness-[1.07] contrast-[1.03] saturate-[1.06]"
              />
            ) : (
              <div className="absolute inset-0 bg-muted/20" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* 1. Airy Left-to-Right contrast scrim */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "linear-gradient(to right, hsl(var(--background) / 0.58) 0%, hsl(var(--background) / 0.4) 18%, hsl(var(--background) / 0.15) 36%, hsl(var(--background) / 0.03) 54%, transparent 72%)",
          }}
          aria-hidden
        />

        {/* 2. Soft localized text contrast accent under title/logo */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "radial-gradient(ellipse 70% 75% at 14% 65%, hsl(var(--background) / 0.45) 0%, hsl(var(--background) / 0.12) 45%, transparent 75%)",
          }}
          aria-hidden
        />

        {/* 3. Soft right-corner atmospheric vignette */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 85% 95%, hsl(var(--background) / 0.72) 0%, hsl(var(--background) / 0.35) 45%, transparent 80%)",
          }}
          aria-hidden
        />

        {/* 4. Soft top gradient under navigation header */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-24 sm:h-32"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.2) 50%, transparent 100%)",
          }}
          aria-hidden
        />

        {/* 5. Subtle left edge feather under floating sidebar */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-20 sm:w-32"
          style={{
            background:
              "linear-gradient(to right, hsl(var(--background) / 0.4) 0%, transparent 100%)",
          }}
          aria-hidden
        />
      </div>

      {/* -------------------------------------------------------------
          FOREGROUND MOVING PANEL: PROMINENT LOGO & CINEMATIC CONTROLS
         ------------------------------------------------------------- */}
      <div className="content-container-fullbleed relative z-[2] pb-12 sm:pb-16 pt-[calc(var(--header-height)+3rem)]">
        <div className="max-w-3xl space-y-4 text-center sm:text-left min-w-0">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={`info-${active.mediaType}-${active.id}`}
              initial={reduceMotion ? false : { opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-4"
            >
              {/* Badges Row */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary backdrop-blur-md shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  Featured
                </span>
                <span className="inline-flex items-center rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-white/90 backdrop-blur-md">
                  {active.mediaType === "tv" ? "TV Series" : "Movie"}
                </span>
                {year ? (
                  <span className="text-xs font-medium text-white/70 px-1">{year}</span>
                ) : null}
                {active.voteAverage != null && active.voteAverage > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-xs font-semibold text-amber-300 backdrop-blur-md">
                    <Star className="h-3 w-3 fill-amber-300" />
                    {formatVote(active.voteAverage)}
                  </span>
                ) : null}
              </div>

              {/* Prominent Title Logo or Styled Display Typography */}
              <div className="space-y-3">
                {logo ? (
                  <Link
                    href={href}
                    className="inline-block transition-transform duration-300 hover:scale-[1.02] focus:outline-none"
                    aria-label={`View ${active.title}`}
                  >
                    <div className="relative h-28 sm:h-36 lg:h-44 w-80 sm:w-[28rem] lg:w-[34rem] max-w-full">
                      <Image
                        src={logo}
                        alt={active.title}
                        fill
                        priority={index === 0}
                        sizes="(max-width: 768px) 360px, 560px"
                        className="object-contain object-bottom sm:object-left-bottom filter drop-shadow-[0_12px_32px_rgba(0,0,0,0.9)] brightness-[1.06]"
                        onError={() => {
                          setFailedLogos((prev) => ({ ...prev, [activeKey]: true }));
                        }}
                      />
                    </div>
                  </Link>
                ) : (
                  <h2 className="font-display text-balance text-[clamp(2.6rem,1.8rem+3.4vw,4.8rem)] font-extrabold leading-[1.04] tracking-[-0.03em] text-white drop-shadow-xl">
                    <Link
                      href={href}
                      className="transition-colors hover:text-primary focus-visible:text-primary focus:outline-none"
                    >
                      {active.title}
                    </Link>
                  </h2>
                )}

                {/* Tagline below logo/title */}
                {activeTagline ? (
                  <p className="text-base sm:text-lg italic text-white/90 text-pretty font-light tracking-wide drop-shadow-md">
                    {activeTagline}
                  </p>
                ) : null}

                {/* Overview */}
                {active.overview ? (
                  <p className="max-w-xl text-sm sm:text-base text-white/85 line-clamp-3 leading-relaxed drop-shadow font-normal text-pretty">
                    {active.overview}
                  </p>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Action Buttons & Glass Carousel Navigation */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2">
            <Link
              href={href}
              prefetch
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:scale-[1.03] active:scale-[0.97]"
            >
              <Play className="h-4 w-4 fill-current" />
              Watch Now
            </Link>
            <Link
              href={href}
              prefetch
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/20 hover:border-white/30 hover:scale-[1.03] active:scale-[0.97]"
            >
              <Info className="h-4 w-4" />
              Details
            </Link>

            {/* Clean Glass Carousel Controls with Liquid Progress Fill */}
            {slides.length > 1 ? (
              <div className="ml-0 sm:ml-2 flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3.5 py-1.5 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_24px_rgba(0,0,0,0.5)]">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all duration-200 hover:bg-white/15 hover:text-white hover:scale-110 active:scale-95"
                  aria-label="Previous featured title"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1.5 px-1">
                  {slides.map((s, i) => {
                    const isActive = i === index;
                    return (
                      <button
                        key={`${s.mediaType}-${s.id}`}
                        type="button"
                        onClick={() => setIndex(i)}
                        aria-label={`Show ${s.title}`}
                        aria-current={isActive}
                        className={cn(
                          "relative h-1.5 rounded-full overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                          isActive
                            ? "w-8 sm:w-10 bg-white/20 shadow-[0_0_10px_rgba(0,0,0,0.4)]"
                            : "w-2 bg-white/30 hover:bg-white/60 hover:w-3"
                        )}
                      >
                        {isActive ? (
                          <span
                            key={`progress-${index}`}
                            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-blue-400 shadow-[0_0_10px_hsl(var(--primary)),0_0_2px_#fff]"
                            style={{
                              animation: `heroProgress ${intervalMs}ms linear forwards`,
                              animationPlayState: paused ? "paused" : "running",
                            }}
                            onAnimationEnd={() => {
                              if (!paused && !reduceMotion) {
                                go(1);
                              }
                            }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all duration-200 hover:bg-white/15 hover:text-white hover:scale-110 active:scale-95"
                  aria-label="Next featured title"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
