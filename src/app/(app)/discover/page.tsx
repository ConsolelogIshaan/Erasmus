import type { Metadata } from "next";
import { Suspense } from "react";

import { HeroBanner } from "@/features/media/components/hero-banner";
import { MediaRow } from "@/features/media/components/media-row";
import { GenreChips } from "@/features/media/components/genre-chips";
import { CatalogConfigBanner } from "@/features/media/components/catalog-config-banner";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { safeGetDiscoveryHome } from "@/lib/media/catalog";
import { extractAmbientColors } from "@/lib/media/ambient-colors";
import { backdropUrl } from "@/lib/media/image";
import { Skeleton } from "@/components/ui/skeleton";
import { ContinueWatchingRail } from "@/features/library/components/continue-watching-rail";
import { ROUTES } from "@/constants/routes";

export const metadata: Metadata = {
  title: "Discover",
  description: "Explore trending movies, TV shows, and more on Erasmus",
};

export const revalidate = 900;

/**
 * Premium discovery homepage — Netflix / Apple TV style immersive stage.
 */
export default async function DiscoverPage() {
  const data = await safeGetDiscoveryHome();
  const rawHeroItems =
    data.heroItems?.length > 0 ? data.heroItems : data.hero ? [data.hero] : [];

  const heroItems = await Promise.all(
    rawHeroItems.map(async (item) => {
      const imgPath = item.backdropPath ?? item.posterPath;
      const palette = await extractAmbientColors(imgPath);
      const backdrop = backdropUrl(imgPath, "w1280");
      return {
        ...item,
        ambientPalette: palette,
        ambientBackdropUrl: backdrop,
      };
    }),
  );

  return (
    <div className="relative min-h-dvh w-full">
      <h1 className="sr-only">Discover — Films and television worth your time</h1>

      {!data.configured ? (
        <div className="content-container-fullbleed pt-[calc(var(--header-height)+3rem)]">
          <CatalogConfigBanner />
        </div>
      ) : null}

      {"error" in data && data.error ? (
        <div className="content-container-fullbleed pt-[calc(var(--header-height)+3rem)]">
          <div
            className="animate-fade-up bg-destructive/12 text-destructive rounded-xl border-0 px-4 py-3 text-sm"
            role="alert"
          >
            <p className="font-medium">Catalog temporarily unavailable</p>
            <p className="text-muted-foreground mt-1">{data.error}</p>
          </div>
        </div>
      ) : null}

      {heroItems.length > 0 ? <HeroBanner items={heroItems} intervalMs={6000} /> : null}

      <div className="content-container-fullbleed space-y-10 pt-6 pb-16">
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}>
          <ScrollReveal delay={0.05}>
            <GenreChips genres={data.genres} />
          </ScrollReveal>
        </Suspense>

        <div className="space-y-10">
          <ContinueWatchingRail
            variant="row"
            cardOrientation="landscape"
            href={ROUTES.library}
          />
          {data.sections.map((section, index) => (
            <MediaRow
              key={section.id}
              title={section.title}
              items={section.items}
              href={section.href}
              priorityCount={index === 0 ? 4 : 0}
            />
          ))}
        </div>

        {data.configured && !data.hero && data.sections.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No catalog content returned. Check your TMDB key and network access.
          </p>
        ) : null}
      </div>
    </div>
  );
}
