"use client";

import * as React from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { SearchResponse, SearchResultItem } from "@/types/media";

const RECENT_KEY = "erasmus:search-recent";
const MAX_RECENT = 12;

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string) {
  if (typeof window === "undefined") return;
  const q = query.trim();
  if (q.length < 2) return;
  try {
    const prev = readRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase());
    const next = [q, ...prev].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

async function fetchSearch(
  query: string,
  signal: AbortSignal,
  page: number,
): Promise<SearchResponse> {
  const res = await fetch(
    `/api/media/search?q=${encodeURIComponent(query)}&page=${page}`,
    { signal },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Search failed");
  }
  return res.json() as Promise<SearchResponse>;
}

async function fetchTrending(): Promise<SearchResultItem[]> {
  const res = await fetch("/api/media/trending");
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: SearchResultItem[] };
  return data.results ?? [];
}

/**
 * Debounced catalog search with cancellation of obsolete requests.
 */
export function useMediaSearch(query: string, enabled: boolean) {
  const [debounced, setDebounced] = React.useState(query);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  const searchQuery = useInfiniteQuery({
    queryKey: ["media-search", debounced],
    queryFn: ({ signal, pageParam }) => fetchSearch(debounced, signal, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, _pages, page) =>
      page < Math.min(last.totalPages ?? 1, 500) ? page + 1 : undefined,
    enabled: enabled && debounced.length >= 2,
    staleTime: 30_000,
  });

  const trendingQuery = useQuery({
    queryKey: ["media-trending-search"],
    queryFn: fetchTrending,
    enabled: enabled && debounced.length < 2,
    staleTime: 5 * 60_000,
  });

  return {
    debouncedQuery: debounced,
    results: [
      ...new Map(
        (searchQuery.data?.pages.flatMap((page) => page.results) ?? []).map((item) => [
          `${item.kind}:${item.id}`,
          item,
        ]),
      ).values(),
    ],
    isLoading:
      query.trim() !== debounced ||
      (searchQuery.isFetching &&
        !searchQuery.isFetchingNextPage &&
        debounced.length >= 2),
    isError: searchQuery.isError,
    error: searchQuery.error,
    retry: searchQuery.refetch,
    hasMore: searchQuery.hasNextPage,
    loadMore: searchQuery.fetchNextPage,
    isLoadingMore: searchQuery.isFetchingNextPage,
    trending: trendingQuery.data ?? [],
    isTrendingLoading: trendingQuery.isLoading,
  };
}
