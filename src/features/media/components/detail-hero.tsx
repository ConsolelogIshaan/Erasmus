"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { RatingsDisplay } from "@/features/media/components/ratings-display";
import { HeroTrailerBackdrop } from "@/features/media/components/hero-trailer-backdrop";
import { logoUrl } from "@/lib/media/image";
import { formatRuntime, formatYear } from "@/lib/media/format";
import { mediaHref } from "@/lib/media/routes";
import type {
  Genre,
  MediaRating,
  MediaVideo,
  StreamingAvailability,
} from "@/types/media";
import { heroContainer, heroItem } from "@/animations/variants";

interface DetailHeroProps {
  title: string;
  tagline?: string | null;
  overview?: string | null;
  backdropPath?: string | null;
  posterPath?: string | null;
  logoPath?: string | null;
  releaseDate?: string | null;
  runtime?: number | null;
  certification?: string | null;
  status?: string | null;
  mediaTypeLabel: string;
  genres?: Genre[];
  ratings?: MediaRating[];
  /** YouTube trailers from TMDB — played full-bleed in the hero stage. */
  videos?: MediaVideo[];
  /** Live where-to-watch chips (Netflix, Prime, etc.). */
  streaming?: StreamingAvailability | null;
  children?: React.ReactNode;
}

/**
 * Shared cinematic hero for movie / TV detail pages.
 * Trailer/backdrop stage with logo + story only (no duplicate poster card).
 */
export function DetailHero({
  title,
  tagline,
  overview,
  backdropPath,
  posterPath,
  logoPath,
  releaseDate,
  runtime,
  certification,
  status,
  mediaTypeLabel,
  genres = [],
  ratings = [],
  videos = [],
  streaming: _streaming,
  children,
}: DetailHeroProps) {
  const reduceMotion = useReducedMotion();
  const [logoFailed, setLogoFailed] = React.useState(false);
  const logo = !logoFailed && logoPath ? logoUrl(logoPath, "w500") : null;
  const year = formatYear(releaseDate);
  const runtimeLabel = formatRuntime(runtime);

  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative flex min-h-[min(84vh,54rem)] w-full flex-col justify-end">
        {/* Video / Still Stage behind foreground */}
        <HeroTrailerBackdrop
          videos={videos}
          backdropPath={backdropPath}
          posterPath={posterPath}
          title={title}
          className="absolute inset-0 z-0"
        />

        {/* Foreground Information: Title, Badges, Overview, Actions */}
        <motion.div
          className="pointer-events-none relative z-10 flex flex-col justify-end pt-[calc(var(--header-height)+2rem)] pb-10 sm:pb-14"
          variants={reduceMotion ? undefined : heroContainer}
          initial={reduceMotion ? false : "hidden"}
          animate="visible"
        >
          <div className="pointer-events-auto w-full max-w-3xl px-6 sm:px-10 lg:px-14">
            <div className="space-y-4 text-center sm:text-left">
              {logo ? (
                <motion.div
                  variants={reduceMotion ? undefined : heroItem}
                  className="relative mx-auto h-20 w-80 max-w-full sm:mx-0 sm:h-28 sm:w-96"
                >
                  <Image
                    src={logo}
                    alt={title}
                    fill
                    className="object-contain object-bottom drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] filter sm:object-left-bottom"
                    sizes="(max-width: 768px) 320px, 480px"
                    priority
                    onError={() => setLogoFailed(true)}
                  />
                </motion.div>
              ) : (
                <motion.h1
                  variants={reduceMotion ? undefined : heroItem}
                  className="font-display text-[clamp(2.2rem,1.5rem+3vw,4rem)] leading-[1.05] font-extrabold tracking-[-0.03em] text-balance text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.8)]"
                >
                  {title}
                </motion.h1>
              )}

              {logo ? <h1 className="sr-only">{title}</h1> : null}

              {tagline ? (
                <motion.p
                  variants={reduceMotion ? undefined : heroItem}
                  className="text-base font-light tracking-wide text-pretty text-white/90 italic drop-shadow-md sm:text-lg"
                >
                  {tagline}
                </motion.p>
              ) : null}

              <motion.div
                variants={reduceMotion ? undefined : heroItem}
                className="flex flex-wrap items-center justify-center gap-2 sm:justify-start"
              >
                <Badge
                  variant="secondary"
                  className="border-white/20 bg-white/15 text-white backdrop-blur-md"
                >
                  {mediaTypeLabel}
                </Badge>
                {certification ? (
                  <Badge
                    variant="outline"
                    className="border-white/25 text-white/90 backdrop-blur-md"
                  >
                    {certification}
                  </Badge>
                ) : null}
                {year ? (
                  <span className="text-sm font-medium text-white/80">{year}</span>
                ) : null}
                {runtimeLabel ? (
                  <span className="text-sm font-medium text-white/80">
                    {runtimeLabel}
                  </span>
                ) : null}
                {status ? (
                  <span className="text-sm font-medium text-white/80">{status}</span>
                ) : null}
              </motion.div>

              {genres.length ? (
                <motion.div
                  variants={reduceMotion ? undefined : heroItem}
                  className="flex flex-wrap justify-center gap-1.5 sm:justify-start"
                >
                  {genres.map((g) => (
                    <Link key={g.id} href={mediaHref("genre", g.id)} prefetch={false}>
                      <Badge
                        variant="muted"
                        className="border-white/15 bg-white/10 text-white/90 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
                      >
                        {g.name}
                      </Badge>
                    </Link>
                  ))}
                </motion.div>
              ) : null}

              {ratings.length ? (
                <motion.div variants={reduceMotion ? undefined : heroItem}>
                  <RatingsDisplay ratings={ratings} />
                </motion.div>
              ) : null}

              {overview ? (
                <motion.p
                  variants={reduceMotion ? undefined : heroItem}
                  className="text-prose-soft max-w-2xl text-sm leading-relaxed text-pretty text-white/85 drop-shadow sm:text-base"
                >
                  {overview}
                </motion.p>
              ) : null}

              {children ? (
                <motion.div variants={reduceMotion ? undefined : heroItem}>
                  {children}
                </motion.div>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
