"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Search, X, Film, Loader2 } from "lucide-react";
import {
  useMediaSearch,
  readRecentSearches,
  pushRecentSearch,
} from "@/features/search/hooks/use-media-search";
import { posterUrl, profileUrl, logoUrl } from "@/lib/media/image";
import { cn } from "@/lib/utils";
import type { SearchResultItem } from "@/types/media";

const filters = [
  "All",
  "Movies",
  "TV Shows",
  "People",
  "Collections",
  "Studios",
  "Genres",
] as const;
const kinds = {
  All: null,
  Movies: "movie",
  "TV Shows": "tv",
  People: "person",
  Collections: "collection",
  Studios: "company",
  Genres: "genre",
} as const;
const labels = {
  movie: "Movie",
  tv: "TV Show",
  person: "Person",
  collection: "Collection",
  company: "Studio",
  genre: "Genre",
};

export function SearchPage({ initialQuery }: { initialQuery: string }) {
  const params = useSearchParams();
  const [query, setQuery] = React.useState(initialQuery);
  const [filter, setFilter] = React.useState<(typeof filters)[number]>("All");
  const [recent, setRecent] = React.useState<string[]>([]);
  const input = React.useRef<HTMLInputElement>(null);
  const {
    results,
    trending,
    isLoading,
    isError,
    retry,
    isTrendingLoading,
    hasMore,
    loadMore,
    isLoadingMore,
  } = useMediaSearch(query, true);
  const searching = query.trim().length > 0;

  React.useEffect(() => {
    setRecent(readRecentSearches());
  }, []);
  React.useEffect(() => {
    setQuery((params.get("q") ?? "").slice(0, 120));
  }, [params]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (query.trim()) url.searchParams.set("q", query.trim());
      else url.searchParams.delete("q");
      if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const items = (searching ? results : trending).filter(
    (item) => !kinds[filter] || item.kind === kinds[filter],
  );
  const loading = searching ? isLoading : isTrendingLoading;
  function remember() {
    pushRecentSearch(query);
    setRecent(readRecentSearches());
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <header className="space-y-5 pt-4 sm:pt-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Find your next watch.
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Movies, shows, anime, people, and more.
          </p>
        </div>
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            remember();
            input.current?.focus();
          }}
          className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 focus-within:border-white/40 sm:px-5"
        >
          <Search className="text-muted-foreground size-5 shrink-0" aria-hidden />
          <label htmlFor="catalog-search" className="sr-only">
            Search the catalog
          </label>
          <input
            ref={input}
            id="catalog-search"
            type="search"
            autoFocus
            autoComplete="off"
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a title, person, or genre…"
            className="placeholder:text-muted-foreground h-16 w-full min-w-0 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              className="text-muted-foreground hover:text-foreground rounded-full p-2 focus-visible:ring-2"
            >
              <X className="size-4" />
            </button>
          )}
        </form>
      </header>
      {!searching && recent.length > 0 && (
        <section
          aria-label="Recent searches"
          className="flex flex-wrap items-center gap-2"
        >
          <span className="text-muted-foreground mr-2 text-xs">Recent</span>
          {recent.slice(0, 6).map((term) => (
            <button
              key={term}
              onClick={() => {
                setQuery(term);
                input.current?.focus();
              }}
              className="rounded-full bg-white/5 px-3 py-2 text-sm hover:bg-white/10 focus-visible:ring-2"
            >
              {term}
            </button>
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Filter search results">
        {filters.map((value) => (
          <button
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition-colors focus-visible:ring-2",
              filter === value
                ? "bg-white text-black"
                : "text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10",
            )}
          >
            {value}
          </button>
        ))}
      </div>
      <section
        aria-label={searching ? "Search results" : "Trending titles"}
        aria-busy={loading}
      >
        <div className="mb-5 flex items-center gap-3">
          <h2 className="text-lg font-medium">
            {searching ? "Search results" : "Trending now"}
          </h2>
          <span
            role="status"
            aria-live="polite"
            className="text-muted-foreground text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1 inline size-4 animate-spin" />
                Searching…
              </>
            ) : searching ? (
              `${items.length} matches`
            ) : (
              ""
            )}
          </span>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : searching && isError ? (
          <div className="py-16 text-center">
            <p>Search couldn’t load. Please try again.</p>
            <button
              onClick={() => void retry()}
              className="mt-4 rounded-full bg-white px-5 py-2 text-sm text-black"
            >
              Retry search
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Film className="text-muted-foreground mx-auto mb-4 size-8" />
            <p>{searching ? "No matches found." : "No trending titles available."}</p>
            <p className="text-muted-foreground mt-2 text-sm">
              {filter !== "All"
                ? "Try All to see other kinds of results."
                : "Try a shorter title or a different keyword."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <ResultCard
                key={`${item.kind}:${item.id}`}
                item={item}
                onSelect={remember}
              />
            ))}
          </div>
        )}
        {searching && hasMore && !loading && (
          <div className="mt-8 text-center">
            <button
              disabled={isLoadingMore}
              onClick={() => void loadMore()}
              className="rounded-full bg-white/10 px-6 py-3 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              {isLoadingMore ? "Loading…" : "Load more results"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function ResultCard({
  item,
  onSelect,
}: {
  item: SearchResultItem;
  onSelect: () => void;
}) {
  const image =
    item.kind === "person"
      ? profileUrl(item.imagePath, "w185")
      : item.kind === "company"
        ? logoUrl(item.imagePath, "w300")
        : posterUrl(item.imagePath, "w342");
  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onSelect}
      className="group min-w-0 rounded-xl focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5">
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 190px"
            className={cn(
              "transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none",
              item.kind === "company" ? "object-contain p-4" : "object-cover",
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Film className="text-muted-foreground size-8" />
          </div>
        )}
      </div>
      <h3 className="mt-3 line-clamp-2 text-sm font-medium">{item.title}</h3>
      <p className="text-muted-foreground mt-1 text-xs">
        {labels[item.kind]}
        {item.year ? ` · ${item.year}` : ""}
      </p>
    </Link>
  );
}
