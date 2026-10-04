"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PosterCard } from "@/features/media/components/poster-card";
import type { MediaSummary } from "@/types/media";
import styles from "./studios.module.css";
import type { StudioFilters } from "../config";

export function StudioRail({
  title,
  items,
  priorityCount = 0,
  catalog,
}: {
  title: string;
  items: MediaSummary[];
  priorityCount?: number;
  catalog: { slug: string; filters: StudioFilters; totalPages: number };
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState(items);
  const [page, setPage] = useState(catalog.filters.page);
  const [totalPages, setTotalPages] = useState(Math.min(500, catalog.totalPages));
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const continueAt = useRef<number | null>(null);
  const hasMore = page < totalPages;
  // Keep the overview bounded; the paginated catalog covers every remaining page.
  const atCapacity = entries.length >= 120;
  const browseHref = `/studios/${catalog.slug}?${new URLSearchParams({ region: catalog.filters.region, type: catalog.filters.type, sort: catalog.filters.sort, page: String(page + 1) })}`;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (continueAt.current !== null && rail.current) {
      rail.current.scrollTo({ left: continueAt.current, behavior: "instant" });
      continueAt.current = null;
    }
  }, [entries.length]);
  async function loadMore() {
    if (inFlight.current || !hasMore || atCapacity) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(false);
    setMessage("");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const params = new URLSearchParams({
        studio: catalog.slug,
        region: catalog.filters.region,
        type: catalog.filters.type,
        sort: catalog.filters.sort,
        page: String(page + 1),
      });
      const response = await fetch(`/api/media/studios?${params}`, {
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Catalog request failed");
      const data = (await response.json()) as {
        results: MediaSummary[];
        page: number;
        totalPages: number;
        unconfirmedCount: number;
      };
      const seen = new Set(entries.map((item) => `${item.mediaType}-${item.id}`));
      const additions = data.results.filter(
        (item) => !seen.has(`${item.mediaType}-${item.id}`),
      );
      if (additions.length && rail.current)
        continueAt.current = Math.max(
          0,
          rail.current.scrollWidth - rail.current.clientWidth * 0.35,
        );
      setEntries((current) => [...current, ...additions]);
      setPage(data.page);
      setTotalPages(Math.min(500, data.totalPages));
      setMessage(
        additions.length
          ? `${additions.length} more titles loaded.${data.unconfirmedCount ? " Unverified listings omitted." : ""}`
          : "No additional confirmed titles on this page. Continue to the next page.",
      );
    } catch {
      if (!abort.signal.aborted) {
        setFailed(true);
        setMessage("Could not load more titles. Retry to continue.");
      }
    } finally {
      inFlight.current = false;
      if (!abort.signal.aborted) setLoading(false);
    }
  }
  if (!entries.length) return null;
  function scroll(direction: number) {
    const element = rail.current;
    if (!element) return;
    if (
      direction > 0 &&
      element.scrollLeft + element.clientWidth >= element.scrollWidth - 8 &&
      hasMore &&
      !atCapacity
    ) {
      void loadMore();
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollBy({
      left: direction * element.clientWidth * 0.85,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  return (
    <section className={styles.shelf} aria-label={title}>
      <div className={styles.shelfHeading}>
        <h2>{title}</h2>
        <div className={styles.railControls}>
          <button
            type="button"
            aria-label={`Scroll ${title} left`}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label={`Scroll ${title} right`}
            onClick={() => scroll(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div
        ref={rail}
        className={styles.posterRail}
        role="list"
        tabIndex={0}
        aria-label={`${title} titles`}
      >
        {entries.map((item, index) => (
          <div
            key={`${item.mediaType}-${item.id}`}
            role="listitem"
            className={styles.posterCell}
          >
            <PosterCard
              item={item}
              className="w-full! min-w-0"
              priority={index < priorityCount}
              hoverEffect="none"
            />
          </div>
        ))}
        {hasMore ? (
          <div className={styles.continueTile} role="listitem">
            <p>More to discover</p>
            {atCapacity ? (
              <Link href={browseHref} prefetch={false}>
                Continue in catalog →
              </Link>
            ) : (
              <button type="button" onClick={() => void loadMore()} disabled={loading}>
                {loading ? "Loading…" : failed ? "Retry" : "Load more"}
              </button>
            )}
          </div>
        ) : null}
      </div>
      <div className={styles.railFooter}>
        <p role="status" aria-live="polite">
          {message ||
            `${entries.length} titles loaded${hasMore ? "" : " · End of catalog"}`}
        </p>
        {hasMore ? (
          atCapacity ? (
            <Link href={browseHref} prefetch={false}>
              Continue in catalog →
            </Link>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadMore()}
              aria-label={`Load more ${title}`}
            >
              {loading ? "Loading…" : failed ? "Retry" : "Load more"}
            </button>
          )
        ) : null}
      </div>
    </section>
  );
}
