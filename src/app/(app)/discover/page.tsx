import type { Metadata } from "next";
import { Suspense } from "react";

import { HeroBanner } from "@/features/media/components/hero-banner";
import { MediaRow } from "@/features/media/components/media-row";
import { GenreChips } from "@/features/media/components/genre-chips";
import { CatalogConfigBanner } from "@/features/media/components/catalog-config-banner";
import { PageLoader } from "@/components/feedback/page-loader";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { safeGetDiscoveryHome } from "@/lib/media/catalog";
import { Skeleton } from "@/components/ui/skeleton";

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
  const heroItems =
    data.heroItems?.length > 0
      ? data.heroItems
      : data.hero
        ? [data.hero]
        : [];

  return (
    <div className="relative w-full min-h-dvh">
      <h1 className="sr-only">Discover — Films and television worth your time</h1>

      {!data.configured ? (
        <div className="content-container-fullbleed pt-[calc(var(--header-height)+1.5rem)]">
          <CatalogConfigBanner />
        </div>
      ) : null}

      {"error" in data && data.error ? (
        <div className="content-container-fullbleed pt-[calc(var(--header-height)+1.5rem)]">
          <div
            className="animate-fade-up rounded-xl border-0 bg-destructive/12 px-4 py-3 text-sm text-destructive"
            role="alert"
          >
            <p className="font-medium">Catalog temporarily unavailable</p>
            <p className="mt-1 text-muted-foreground">{data.error}</p>
          </div>
        </div>
      ) : null}

      {heroItems.length > 0 ? (
        <HeroBanner items={heroItems} intervalMs={6000} />
      ) : null}

      <div className="content-container-fullbleed space-y-10 pb-16 pt-6">
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}>
          <ScrollReveal delay={0.05}>
            <GenreChips genres={data.genres} />
          </ScrollReveal>
        </Suspense>

        <div className="space-y-10">
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
          <p className="text-sm text-muted-foreground">
            No catalog content returned. Check your TMDB key and network access.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DiscoverLoading() {
  return <PageLoader />;
}
