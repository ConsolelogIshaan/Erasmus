import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  Compass,
  Gift,
  Library,
  Lightbulb,
  Search,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal } from "@/components/motion/scroll-reveal";
import { LibraryPosterCard } from "@/features/library/components/library-poster-card";
import { LibraryFilters } from "@/features/library/components/library-filters";
import { ContinueWatchingRail } from "@/features/library/components/continue-watching-rail";
import { listLibrary } from "@/lib/library/entries";
import type { LibraryListFilters } from "@/types/library";
import { MediaRow } from "@/features/media/components/media-row";
import { PosterCard } from "@/features/media/components/poster-card";
import { StatCounter } from "@/features/intelligence/components/stat-counter";
import { SeriesStatsTabs } from "@/features/intelligence/components/series-stats-tabs";
import { InsightCards } from "@/features/intelligence/components/insight-cards";
import { DashboardSection } from "@/features/intelligence/components/dashboard-section";
import {
  ActivityAreaChart,
  GenrePieChart,
} from "@/features/intelligence/components/charts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ProfileForm } from "@/features/profile/components/profile-form";
import { getSessionContext } from "@/lib/services/user-service";
import { formatDisplayName } from "@/lib/utils";
import { formatDate } from "@/lib/media/format";
import { ROUTES } from "@/constants/routes";
import { getDashboardPayload } from "@/lib/intelligence/dashboard";
import { formatWatchHours } from "@/lib/intelligence/stats-engine";
import { formatRelativeDate } from "@/lib/utils";
import type { Profile } from "@/types";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your watch history, habits, and profile details",
};

function fallbackProfile(userId: string, email?: string | null): Profile {
  const local = email?.split("@")[0] ?? "user";
  return {
    id: userId,
    username: local.slice(0, 32),
    display_name: local,
    bio: null,
    avatar_url: null,
    website: null,
    is_public: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Premium intelligence dashboard & profile — personal home for Erasmus with integrated library and profile options.
 */
export default async function DashboardPage({ searchParams }: PageProps) {
  const { user, profile } = await getSessionContext();
  if (!user) return null;

  const profileData = profile ?? fallbackProfile(user.id, user.email);
  const name = formatDisplayName({
    displayName: profileData.display_name,
    username: profileData.username,
    email: user.email,
  });
  const initials = name.replace("@", "").slice(0, 2).toUpperCase();

  const params = searchParams ? await searchParams : {};
  const getParam = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const libraryFilters: LibraryListFilters = {
    status: (getParam("status") as LibraryListFilters["status"]) ?? "all",
    mediaType: (getParam("type") as "movie" | "tv" | "all") ?? "all",
    q: getParam("q"),
    sort: (getParam("sort") as LibraryListFilters["sort"]) ?? "last_watched",
    page: 1,
    pageSize: 18,
  };

  const [dash, libraryData] = await Promise.all([
    getDashboardPayload(user.id),
    listLibrary(user.id, libraryFilters),
  ]);

  const { stats, insights } = dash;
  const year = new Date().getFullYear();

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border-0 bg-muted/30 dark:bg-white/[0.04]">
        <div
          className="absolute inset-0 h-32 gradient-mesh dark:gradient-mesh-dark sm:h-40"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 px-4 pb-6 pt-16 sm:flex-row sm:items-end sm:px-8 sm:pt-24">
          <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-background shadow-lg shrink-0">
            {profileData.avatar_url ? <AvatarImage src={profileData.avatar_url} alt="" /> : null}
            <AvatarFallback className="text-2xl font-semibold bg-white/[0.08]">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl text-balance">
                {name}
              </h1>
              {profileData.username ? (
                <span className="text-sm font-medium text-muted-foreground/80">@{profileData.username}</span>
              ) : null}
            </div>
            {profileData.bio ? (
              <p className="max-w-xl text-sm text-muted-foreground text-pretty">{profileData.bio}</p>
            ) : null}
            <p className="text-xs text-muted-foreground/70">
              Member since {formatDate(profileData.created_at) ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={ROUTES.library}>
                <Library className="h-4 w-4" />
                Library
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.librarySearch}>
                <Search className="h-4 w-4" />
                Quick search
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.discover}>
                <Compass className="h-4 w-4" />
                Discover
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={ROUTES.wrapped(year)}>
                <Gift className="h-4 w-4" />
                {year} Wrapped
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Hero metrics — equal-height tiles */}
      <ScrollReveal variant="scale">
        <section className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4 stagger-children">
          <StatCounter
            value={Math.round(stats.totals.totalWatchMinutes / 60)}
            label="Hours watched"
            hint={formatWatchHours(stats.totals.totalWatchMinutes)}
            suffix="h"
          />
          <StatCounter
            value={stats.totals.moviesWatched}
            label="Movies finished"
            hint={`${stats.totals.librarySize} in library`}
          />
          <SeriesStatsTabs
            episodesWatched={stats.totals.episodesWatched}
            showsTracked={stats.totals.showsTracked}
            showsCompleted={stats.totals.showsCompleted}
            showsWatching={stats.totals.showsWatching}
            showsDropped={stats.totals.showsDropped}
          />
          <StatCounter
            value={stats.streaks.current}
            label="Current streak"
            hint={`Best ${stats.streaks.longest} days`}
            suffix="d"
          />
        </section>
      </ScrollReveal>

      {/* Insights strip */}
      {insights.length > 0 ? (
        <DashboardSection
          title="Insights"
          href={ROUTES.insights}
          description="What your watch history says about you"
        >
          <InsightCards insights={insights.slice(0, 3)} />
        </DashboardSection>
      ) : null}

      {/* Continue watching — full width sleek rail */}
      <DashboardSection title="Continue watching" href={ROUTES.library}>
        <ContinueWatchingRail initialEntries={dash.continueWatching} />
      </DashboardSection>

      {/* Viewing Activity & Breakdown Charts — balanced 2-column analytics row */}
      <section className="space-y-4" aria-label="Viewing activity and breakdown">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-section-title">Activity & Habits</h2>
            <p className="text-meta text-muted-foreground">
              Your viewing rhythm across months and favorite genres.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.calendar}>
                <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
                Calendar
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.timeline}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Timeline
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={ROUTES.insights}>
                <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                All insights
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <ActivityAreaChart data={stats.distributions.months} />
          <GenrePieChart data={stats.distributions.genres} />
        </div>
      </section>

      {/* Recently completed + Plan to watch — balanced pairs */}
      <div className="grid gap-8 lg:grid-cols-2">
        <DashboardSection title="Recently completed" href={ROUTES.library}>
          {dash.recentlyWatched.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Finish a title to see it here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 md:grid-cols-4">
              {dash.recentlyWatched.map((e) => (
                <LibraryPosterCard key={e.id} entry={e} />
              ))}
            </div>
          )}
        </DashboardSection>

        <DashboardSection title="Plan to watch" href={ROUTES.watchlist}>
          {dash.planToWatch.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Queue something from Discover.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 md:grid-cols-4">
              {dash.planToWatch.map((e) => (
                <LibraryPosterCard key={e.id} entry={e} showProgress={false} />
              ))}
            </div>
          )}
        </DashboardSection>
      </div>

      {/* Recently rated + Dropped — balanced pairs */}
      <div className="grid gap-8 lg:grid-cols-2">
        <DashboardSection title="Recently rated" href={ROUTES.library}>
          {dash.recentlyRated.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rate a title to see it here.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 md:grid-cols-4">
              {dash.recentlyRated.slice(0, 8).map((e) => (
                <LibraryPosterCard key={e.id} entry={e} />
              ))}
            </div>
          )}
        </DashboardSection>

        <DashboardSection title="Dropped" href={ROUTES.library}>
          {dash.dropped.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dropped titles.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-3 md:grid-cols-4">
              {dash.dropped.map((e) => (
                <LibraryPosterCard key={e.id} entry={e} showProgress={false} />
              ))}
            </div>
          )}
        </DashboardSection>
      </div>

      {/* Your Library Section */}
      <DashboardSection
        title="Your Library"
        href={ROUTES.library}
        description="Filter and browse your tracked collection directly from Home"
      >
        <div className="space-y-4">
          <Suspense fallback={null}>
            <LibraryFilters showSearch={false} />
          </Suspense>

          {libraryData.items.length === 0 ? (
            <p className="text-sm text-muted-foreground pt-2">
              No titles in your library matching this filter.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {libraryData.items.slice(0, 12).map((entry) => (
                  <LibraryPosterCard key={entry.id} entry={entry} />
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Showing {Math.min(12, libraryData.items.length)} of {libraryData.total} titles
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link href={ROUTES.library}>
                    Go to full library
                    <Library className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      </DashboardSection>

      {/* Recommendations */}
      {dash.recommendations.length > 0 ? (
        <DashboardSection
          title="Recommended for you"
          description="Based on genres, ratings, and history — not AI"
        >
          <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
            {dash.recommendations.map((item) => (
              <div key={`${item.mediaType}-${item.id}`} className="w-36 shrink-0 sm:w-40">
                <PosterCard item={item} />
                <p className="mt-1 line-clamp-2 px-0.5 text-[11px] text-muted-foreground">
                  {item.reason}
                </p>
              </div>
            ))}
          </div>
        </DashboardSection>
      ) : null}

      {dash.trending.length > 0 ? (
        <MediaRow title="Trending now" items={dash.trending} href={ROUTES.discover} />
      ) : null}
      {dash.newReleases.length > 0 ? (
        <MediaRow title="New releases" items={dash.newReleases} href={ROUTES.movies} />
      ) : null}
      {dash.upcoming.length > 0 ? (
        <MediaRow title="Upcoming" items={dash.upcoming} href="/movies?section=upcoming" />
      ) : null}

      {/* Pinned collections + reviews */}
      <div className="grid gap-8 lg:grid-cols-2">
        <DashboardSection title="Pinned collections" href={ROUTES.collections}>
          {dash.pinnedCollections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pin a collection to surface it here.</p>
          ) : (
            <ul className="space-y-2">
              {dash.pinnedCollections.map((c) => (
                <li key={c.id}>
                  <Link
                    href={ROUTES.collectionDetail(c.id)}
                    className="flex items-center justify-between rounded-2xl border-0 bg-muted/40 px-3 py-2.5 text-sm transition-colors hover:bg-muted/65 dark:bg-white/[0.05] dark:hover:bg-white/[0.08]"
                  >
                    <span className="font-medium">{c.name}</span>
                    <Badge variant="muted">{c.item_count}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection title="Recently reviewed" href={ROUTES.activity}>
          {dash.recentlyReviewed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Write a review from any title page.</p>
          ) : (
            <ul className="space-y-3">
              {dash.recentlyReviewed.map(({ entry, reviewPreview }) => (
                <li
                  key={entry.id}
                  className="rounded-2xl border-0 bg-muted/40 px-3 py-2.5 dark:bg-white/[0.05]"
                >
                  <Link
                    href={
                      entry.media_type === "movie"
                        ? ROUTES.movie(entry.external_id)
                        : ROUTES.show(entry.external_id)
                    }
                    className="text-sm font-medium hover:underline"
                  >
                    {entry.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {reviewPreview}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>

      {/* Favorite genres chips */}
      {stats.favorites.genres.length > 0 ? (
        <DashboardSection title="Favorite genres" href={ROUTES.genres}>
          <div className="flex flex-wrap gap-2">
            {stats.favorites.genres.map((g) => (
              <Badge
                key={g.name}
                variant="muted"
                className="h-8 rounded-xl border-0 bg-muted/70 px-3 text-foreground dark:bg-white/[0.07]"
              >
                {g.name}
                <span className="ml-1.5 text-muted-foreground">{g.count}</span>
              </Badge>
            ))}
          </div>
        </DashboardSection>
      ) : null}

      {/* Activity timeline preview */}
      <DashboardSection title="Activity" href={ROUTES.timeline}>
        {dash.activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Your feed will fill as you journal.</p>
        ) : (
          <ul className="space-y-2">
            {dash.activity.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-xl border-0 bg-muted/40 px-3 py-2 text-sm dark:bg-white/[0.05]"
              >
                <span>{a.summary}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDate(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      {/* Profile options & settings */}
      <section className="pt-2">
        <Card className="mx-auto max-w-2xl border-0 bg-muted/30 dark:bg-white/[0.04] shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Edit profile</CardTitle>
            <CardDescription>
              Public details about you. Manage your username, display name, and bio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm profile={profileData} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
