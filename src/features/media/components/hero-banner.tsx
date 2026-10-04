"use client";

import * as React from "react";
import Image, { getImageProps } from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Play, Info, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";
import { backdropUrl, logoUrl } from "@/lib/media/image";
import { formatYear } from "@/lib/media/format";
import { ImdbRatingBadge } from "@/features/media/components/imdb-rating-badge";
import { mediaHref } from "@/lib/media/routes";
import { markPlaybackClick, prepareClientStream } from "@/lib/streaming/client-resolution";
import { readPreferredServer } from "@/features/streaming/components/servers-modal";
import { StreamingTheaterModal } from "@/features/streaming/components/streaming-theater-modal";
import { getTvShowResume } from "@/lib/streaming/playback-progress";
import type { MediaSummary } from "@/types/media";
import { useAmbient } from "@/providers/ambient-provider";
import type { AmbientPalette } from "@/lib/media/ambient-palette-types";
import { fetchClientMediaDetails } from "@/lib/media/client-details";

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

function subscribePageVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const getPageVisibility = () => document.visibilityState !== "hidden";
const getServerVisibility = () => true;
const HERO_LOGO_SIZES = "(max-width: 768px) 360px, 560px";

/**
 * Grand cinematic full-bleed discovery hero moving panel.
 * Features synchronized ambient atmosphere blending, silky Ken Burns backdrop crossfades,
 * gentle optical de-blurring title motion, and liquid countdown progress pills.
 */
export function HeroBanner({ items, item, intervalMs = 6000, ctaHref }: HeroBannerProps) {
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
  const fetchedKeysRef = React.useRef<Set<string>>(new Set());
  const heroRef = React.useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = React.useState(true);
  const [settledBackgrounds, setSettledBackgrounds] = React.useState<Record<string, boolean>>({});
  const pageVisible = React.useSyncExternalStore(
    subscribePageVisibility, getPageVisibility, getServerVisibility,
  );
  const canWork = heroVisible && pageVisible && !theaterOpen;
  const active = slides[index] ?? slides[0];
  const bg = active ? backdropUrl(active.backdropPath ?? active.posterPath, "original") : null;
  const backgroundSettled = !bg || settledBackgrounds[bg] === true;

  React.useEffect(() => {
    const element = heroRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setHeroVisible(entry?.isIntersecting ?? false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const go = React.useCallback(
    (dir: -1 | 1) => {
      setIndex((i) => (i + dir + slides.length) % slides.length);
    },
    [slides.length],
  );

  // Auto-advance carousel timer (pauses on hover)
  React.useEffect(() => {
    if (slides.length <= 1 || paused || !canWork) return;
    if (!backgroundSettled) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, canWork, intervalMs, bg, backgroundSettled]);

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

  const next = slides[(index + 1) % slides.length];
  const nextBackdrop = next ? backdropUrl(next.backdropPath ?? next.posterPath, "original") : null;
  const nextKey = next ? `${next.mediaType}:${next.id}` : "";
  const nextLogo = logoUrl(detailsCache[nextKey]?.logoPath ?? next?.logoPath, "w500");

  // Speculative artwork stays low priority and stops when the hero is hidden.
  React.useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!canWork || slides.length <= 1 || connection?.saveData) return;
    const artwork: { src: string; srcSet?: string; sizes?: string }[] = [];
    if (nextBackdrop) artwork.push({ src: nextBackdrop });
    if (nextLogo) {
      const { props } = getImageProps({ src: nextLogo, alt: "", fill: true, sizes: HERO_LOGO_SIZES });
      artwork.push({ src: props.src, srcSet: props.srcSet, sizes: props.sizes });
    }
    const images = artwork.map(({ src, srcSet, sizes }) => {
      const img = new window.Image();
      img.decoding = "async";
      img.fetchPriority = "low";
      if (sizes) img.sizes = sizes;
      if (srcSet) img.srcset = srcSet;
      img.src = src;
      return img;
    });
    return () => images.forEach((img) => {
      img.removeAttribute("src");
      img.removeAttribute("srcset");
    });
  }, [canWork, slides.length, nextBackdrop, nextLogo]);

  React.useEffect(() => {
    if (!canWork) return;
    [slides[index], slides[(index + 1) % slides.length]].forEach((slide) => {
      if (!slide) return;
      const key = `${slide.mediaType}:${slide.id}`;

      // Details fetch if logo not yet known (strictly once per slide)
      if (slide.logoPath || fetchedKeysRef.current.has(key)) return;
      fetchedKeysRef.current.add(key);

      fetchClientMediaDetails(slide.mediaType, slide.id)
        .then((data) => {
          if (!data) return;
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
  }, [slides, index, canWork]);

  if (!active) return null;

  const activeKey = `${active.mediaType}:${active.id}`;
  const activeDetails = detailsCache[activeKey];
  const activeLogoPath = activeDetails?.logoPath ?? active.logoPath ?? null;
  const activeTagline = activeDetails?.tagline ?? active.tagline ?? null;
  const logo =
    !failedLogos[activeKey] && activeLogoPath ? logoUrl(activeLogoPath, "w500") : null;

  const href = ctaHref ?? mediaHref(active.mediaType, active.id);
  const year = formatYear(active.releaseDate);

  const tvResume = active.mediaType === "tv" ? getTvShowResume(String(active.id)) : null;
  const playSeason = tvResume?.season ?? 1;
  const playEpisode = tvResume?.episode ?? 1;

  return (
    <section
      ref={heroRef}
      data-carousel-running={canWork && !paused && slides.length > 1 && backgroundSettled}
      className="relative flex min-h-[min(94vh,64rem)] w-full flex-col justify-end overflow-hidden select-none"
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
          maskImage: "linear-gradient(to bottom, black 0%, black 65%, transparent 100%)",
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
                unoptimized
                decoding="async"
                onLoad={() => setSettledBackgrounds((prev) => prev[bg] ? prev : { ...prev, [bg]: true })}
                onError={() => setSettledBackgrounds((prev) => prev[bg] ? prev : { ...prev, [bg]: true })}
                alt=""
                fill
                priority={true}
                sizes="100vw"
                className="object-cover object-top brightness-[1.07] contrast-[1.03] saturate-[1.06] filter sm:object-center"
              />
            ) : (
              <div className="bg-muted/20 absolute inset-0" />
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
      </div>

      {/* -------------------------------------------------------------
          FOREGROUND MOVING PANEL: PROMINENT LOGO & CINEMATIC CONTROLS
         ------------------------------------------------------------- */}
      <div className="content-container-fullbleed relative z-[2] pt-[calc(var(--header-height)+3rem)] pb-12 sm:pb-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl min-w-0 space-y-4 text-center sm:text-left">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={`info-${active.mediaType}-${active.id}`}
                initial={
                  reduceMotion ? false : { opacity: 0, y: 12, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={
                  reduceMotion ? undefined : { opacity: 0, y: -8, filter: "blur(4px)" }
                }
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-4"
              >
                {/* Prominent Title Logo or Styled Display Typography */}
                <div className="space-y-3">
                  {logo ? (
                    <Link
                      href={href}
                      prefetch={false}
                      className="inline-block transition-transform duration-300 hover:scale-[1.02] focus:outline-none"
                      aria-label={`View ${active.title}`}
                    >
                      <div className="relative h-28 w-80 max-w-full sm:h-36 sm:w-[28rem] lg:h-44 lg:w-[34rem]">
                        <Image
                          src={logo}
                          alt={active.title}
                          fill
                          priority={index === 0}
                          sizes={HERO_LOGO_SIZES}
                          className="object-contain object-bottom brightness-[1.06] drop-shadow-[0_12px_32px_rgba(0,0,0,0.9)] filter sm:object-left-bottom"
                          onError={() => {
                            setFailedLogos((prev) => ({ ...prev, [activeKey]: true }));
                          }}
                        />
                      </div>
                    </Link>
                  ) : (
                    <h2 className="font-display text-[clamp(2.6rem,1.8rem+3.4vw,4.8rem)] leading-[1.04] font-extrabold tracking-[-0.03em] text-balance text-white drop-shadow-xl">
                      <Link
                        href={href}
                        prefetch={false}
                        className="hover:text-primary focus-visible:text-primary transition-colors focus:outline-none"
                      >
                        {active.title}
                      </Link>
                    </h2>
                  )}

                  {/* Tagline below logo/title */}
                  {activeTagline ? (
                    <p className="text-base font-light tracking-wide text-pretty text-white/90 italic drop-shadow-md sm:text-lg">
                      {activeTagline}
                    </p>
                  ) : null}

                  {/* Overview */}
                  {active.overview ? (
                    <p className="line-clamp-3 max-w-xl text-sm leading-relaxed font-normal text-pretty text-white/85 drop-shadow sm:text-base">
                      {active.overview}
                    </p>
                  ) : null}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Action Buttons & Badges Row */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2 sm:justify-start sm:gap-3.5">
              {/* Circular White Play Button */}
              <button
                type="button"
                onPointerEnter={() => prepareClientStream({ type: active.mediaType, id: String(active.id), title: active.title, server: readPreferredServer(), season: playSeason, episode: playEpisode })}
                onFocus={() => prepareClientStream({ type: active.mediaType, id: String(active.id), title: active.title, server: readPreferredServer(), season: playSeason, episode: playEpisode })}
                onClick={() => { markPlaybackClick(); setTheaterOpen(true); }}
                className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black shadow-xl shadow-black/50 transition-all duration-200 hover:scale-105 hover:bg-white/90 active:scale-95 sm:h-13 sm:w-13"
                aria-label={`Play ${active.title}`}
              >
                <Play className="ml-0.5 h-5 w-5 fill-black text-black" />
              </button>

              {/* Pill See More Button */}
              <Link
                href={href}
                prefetch={false}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/45 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition-all duration-200 hover:scale-[1.02] hover:border-white/35 hover:bg-white/15 active:scale-[0.98] sm:gap-2.5 sm:px-6 sm:text-base"
                aria-label={`See more details about ${active.title}`}
              >
                <Info className="h-5 w-5 text-white" />
                See More
              </Link>

              {/* Badges Row */}
              <div className="flex flex-wrap items-center justify-center gap-2 sm:ml-2 sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold tracking-wider text-white uppercase shadow-sm backdrop-blur-md">
                  <Sparkles className="h-3 w-3 text-white/80" />
                  Featured
                </span>
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium tracking-wider text-white/90 uppercase backdrop-blur-md">
                  {active.mediaType === "tv" ? "TV Series" : "Movie"}
                </span>
                {year ? (
                  <span className="px-1 text-xs font-medium text-white/70">{year}</span>
                ) : null}
                <ImdbRatingBadge mediaType={active.mediaType} id={active.id} className="text-xs" />
              </div>
            </div>
          </div>

          {/* Clean Glass Carousel Controls with Liquid Progress Fill — positioned in bottom right */}
          {slides.length > 1 ? (
            <div className="flex shrink-0 items-center justify-center md:justify-end md:pb-1">
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3.5 py-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all duration-200 hover:scale-110 hover:bg-white/15 hover:text-white active:scale-95"
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
                          "relative h-1.5 overflow-hidden rounded-full transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-1 focus-visible:ring-white focus-visible:outline-none",
                          isActive
                            ? "w-8 bg-white/20 shadow-[0_0_10px_rgba(0,0,0,0.4)] sm:w-10"
                            : "w-2 bg-white/30 hover:w-3 hover:bg-white/60",
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
                  className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-all duration-200 hover:scale-110 hover:bg-white/15 hover:text-white active:scale-95"
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
