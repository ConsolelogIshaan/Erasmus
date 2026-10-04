import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";

import { CatalogConfigBanner } from "@/features/media/components/catalog-config-banner";
import { PaginationControls } from "@/features/media/components/pagination-controls";
import { StudioFilters } from "@/features/studios/components/studio-filters";
import { StudioCatalogError } from "@/features/studios/components/studio-catalog-error";
import { StudioGrid } from "@/features/studios/components/studio-grid";
import { StudioWordmark } from "@/features/studios/components/studio-wordmark";
import { StudioCard } from "@/features/studios/components/studio-card";
import { StudioRail } from "@/features/studios/components/studio-rail";
import styles from "@/features/studios/components/studios.module.css";
import {
  getStudio,
  parseStudioFilters,
  STUDIO_REGIONS,
  STUDIOS,
  type Studio,
  type StudioFilters as Filters,
} from "@/features/studios/config";
import { getStudioCatalog } from "@/features/studios/catalog";
import { isCatalogConfigured } from "@/lib/media/catalog";
import type { CSSProperties } from "react";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const studio = getStudio((await params).slug);
  return { title: studio ? `${studio.name} · Studios` : "Studio not found" };
}

export default async function StudioPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const studio = getStudio(slug);
  if (!studio) notFound();
  const filters = parseStudioFilters(query, studio);
  const region = STUDIO_REGIONS.find((region) => region.code === filters.region)!;
  const overview = !query.type && !query.sort && !query.page;
  return (
    <div
      className={styles.studioPage}
      data-studio={studio.slug}
      style={{ "--studio-color": studio.color } as CSSProperties}
    >
      <div className={styles.brandBackdrop} aria-hidden="true" />
      <Link
        href="/studios"
        prefetch={false}
        className="text-muted-foreground hover:text-foreground focus-visible:outline-ring relative inline-flex items-center gap-2 rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All studios
      </Link>
      <header className={styles.brandHero}>
        <h1 className="sr-only">{studio.name}</h1>
        <StudioWordmark studio={studio} hero />
        <p className={styles.catalogScope}>Movies &amp; series · {region.name}</p>
      </header>
      <section className={styles.serviceSwitcher} aria-label="Explore studios">
        <h2 className={styles.switcherHeading}>Explore studios</h2>
        <div className={styles.serviceRail}>
          {STUDIOS.filter((other) => other.slug !== studio.slug).map((other) => (
            <StudioCard key={other.slug} studio={other} />
          ))}
        </div>
      </section>
      <StudioFilters slug={studio.slug} filters={filters} />
      {isCatalogConfigured() ? (
        <Suspense
          key={`${slug}-${filters.region}-${filters.type}-${filters.sort}-${filters.page}`}
          fallback={<CatalogSkeleton />}
        >
          <StudioResults studio={studio} filters={filters} overview={overview} />
        </Suspense>
      ) : (
        <CatalogConfigBanner />
      )}
      {overview && isCatalogConfigured() ? (
        <Suspense
          key={`${slug}-${filters.region}-spotlight`}
          fallback={<CatalogSkeleton />}
        >
          <StudioSpotlight studio={studio} filters={filters} />
        </Suspense>
      ) : null}
      <p className="border-border/40 text-muted-foreground border-t pt-6 text-xs leading-relaxed">
        Each title is checked against {studio.name}’s streaming availability in{" "}
        {region.name}, including originals and licensed titles. Availability data from
        TMDB and JustWatch; catalog updates may lag the service.
      </p>
    </div>
  );
}

async function StudioResults({
  studio,
  filters,
  overview,
}: {
  studio: Studio;
  filters: Filters;
  overview: boolean;
}) {
  let result;
  try {
    result = await getStudioCatalog(studio, filters);
  } catch (error) {
    console.error(
      `[studios] ${studio.slug}/${filters.region}/${filters.type}: catalog request failed`,
      error instanceof Error ? error.message : "Unknown error",
    );
    return <StudioCatalogError />;
  }
  const lastPage = Math.max(1, Math.min(500, result.totalPages));
  if (filters.page > lastPage) {
    const query = new URLSearchParams({
      type: filters.type,
      region: filters.region,
      sort: filters.sort,
      page: String(lastPage),
    });
    redirect(`/studios/${studio.slug}?${query}`);
  }
  const kind = filters.type === "tv" ? "TV shows" : "Movies";
  return (
    <section aria-label={`${studio.name} ${kind.toLowerCase()}`} className="space-y-8">
      {!overview ? (
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-medium">{kind}</h2>
          <p className="text-muted-foreground text-sm tabular-nums">
            {result.results.length} titles on this page
          </p>
        </div>
      ) : null}
      {result.unconfirmedCount > 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          Some listings could not be checked and were omitted. Refresh to try again.
        </p>
      ) : null}
      {overview && result.results.length ? (
        <StudioRail
          title={`Popular on ${studio.name}`}
          items={result.results}
          priorityCount={6}
          key={`${studio.slug}-${filters.region}-${filters.type}`}
          catalog={{ slug: studio.slug, filters, totalPages: result.totalPages }}
        />
      ) : (
        <StudioGrid items={result.results} page={filters.page} />
      )}
      {overview ? (
        <Link
          href={`/studios/${studio.slug}?${new URLSearchParams({ region: filters.region, type: "movie", sort: "popular" })}`}
          prefetch={false}
          className="text-muted-foreground hover:text-foreground focus-visible:outline-ring inline-flex rounded-md text-sm focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Browse all movies →
        </Link>
      ) : (
        <PaginationControls
          page={filters.page}
          totalPages={result.totalPages}
          basePath={`/studios/${studio.slug}`}
          searchParams={{
            region: filters.region,
            type: filters.type,
            sort: filters.sort,
          }}
        />
      )}
    </section>
  );
}

async function StudioSpotlight({
  studio,
  filters,
}: {
  studio: Studio;
  filters: Filters;
}) {
  let result;
  try {
    result = await getStudioCatalog(studio, {
      ...filters,
      type: "tv",
      page: 1,
      sort: "popular",
    });
  } catch {
    return (
      <div>
        <h2 className="mb-3 text-lg font-medium">TV Series Spotlight</h2>
        <StudioCatalogError />
      </div>
    );
  }
  if (!result.results.length) return null;
  return (
    <div className="space-y-3">
      <StudioRail
        title="TV Series Spotlight"
        items={result.results}
        key={`${studio.slug}-${filters.region}-tv`}
        catalog={{
          slug: studio.slug,
          filters: { ...filters, type: "tv", page: 1, sort: "popular" },
          totalPages: result.totalPages,
        }}
      />
      <Link
        href={`/studios/${studio.slug}?${new URLSearchParams({ region: filters.region, type: "tv", sort: "popular" })}`}
        prefetch={false}
        className="text-muted-foreground hover:text-foreground inline-flex rounded-md text-sm"
      >
        Browse all TV shows →
      </Link>
      {result.unconfirmedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          Some TV listings could not be verified and were omitted.
        </p>
      ) : null}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading studio catalog"
      className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {Array.from({ length: 12 }, (_, index) => (
        <div
          key={index}
          className="bg-muted/50 aspect-[2/3] rounded-xl motion-safe:animate-pulse"
        />
      ))}
    </div>
  );
}
