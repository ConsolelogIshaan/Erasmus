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
import { StreamingTheaterModal } from "@/features/streaming/components/streaming-theater-modal";
import { getTvShowResume } from "@/lib/streaming/playback-progress";
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
  const [theaterOpen, setTheaterOpen] = React.useState(false);

  const go = React.useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length]
  );

  // Auto-advance carousel timer (pauses on hover)
  React.useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, intervalMs]);

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

  const tvResume = active.mediaType === "tv" ? getTvShowResume(String(active.id)) : null;
  const playSeason = tvResume?.season ?? 1;
  const playEpisode = tvResume?.episode ?? 1;

  return (
    <section
      className="relative w-full overflow-hidden min-h-[min(94vh,64rem)] flex flex-col justify-end select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured titles"
    >


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
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
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

            {/* Action Buttons & Badges Row */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 sm:gap-3.5 pt-2">
              {/* Circular White Play Button */}
              <button
                type="button"
                onClick={() => setTheaterOpen(true)}
                className="flex h-12 w-12 sm:h-13 sm:w-13 items-center justify-center rounded-full bg-white text-black shadow-xl shadow-black/50 transition-all duration-200 hover:bg-white/90 hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                aria-label={`Play ${active.title}`}
              >
                <Play className="h-5 w-5 fill-black text-black ml-0.5" />
              </button>

              {/* Pill See More Button */}
              <Link
                href={href}
                prefetch
                className="inline-flex items-center gap-2 sm:gap-2.5 rounded-full border border-white/25 bg-black/45 hover:bg-white/15 hover:border-white/35 px-5 sm:px-6 py-3 text-sm sm:text-base font-semibold text-white backdrop-blur-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                aria-label={`See more details about ${active.title}`}
              >
                <Info className="h-5 w-5 text-white" />
                See More
              </Link>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:ml-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur-md shadow-sm">
                  <Sparkles className="h-3 w-3 text-white/80" />
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
            </div>
          </div>

          {/* Clean Glass Carousel Controls with Liquid Progress Fill — positioned in bottom right */}
          {slides.length > 1 ? (
            <div className="flex items-center justify-center md:justify-end shrink-0 md:pb-1">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3.5 py-1.5 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_24px_rgba(0,0,0,0.5)]">
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
                          "relative h-1.5 rounded-full overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white",
                          isActive
                            ? "w-8 sm:w-10 bg-white/20 shadow-[0_0_10px_rgba(0,0,0,0.4)]"
                            : "w-2 bg-white/30 hover:bg-white/60 hover:w-3"
                        )}
                      >
                        {isActive ? (
                          <span
                            key={`progress-${index}`}
                            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9),0_0_2px_#fff]"
                            style={{
                              animation: `heroProgress ${intervalMs}ms linear forwards`,
                              animationPlayState: paused ? "paused" : "running",
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
            </div>
          ) : null}
        </div>
      </div>

      {theaterOpen ? (
        <StreamingTheaterModal
          open={theaterOpen}
          onOpenChange={setTheaterOpen}
          title={active.title}
          tmdbId={String(active.id)}
          mediaType={active.mediaType}
          identity={{
            provider: "tmdb",
            mediaType: active.mediaType,
            externalId: String(active.id),
            title: active.title,
            posterPath: active.posterPath ?? undefined,
            releaseDate: active.releaseDate ?? undefined,
          }}
          currentSeason={active.mediaType === "tv" ? playSeason : undefined}
          currentEpisode={active.mediaType === "tv" ? playEpisode : undefined}
          logoPath={activeLogoPath}
          tagline={activeTagline}
        />
      ) : null}
    </section>
  );
}
