import type {
  TmdbMovieListItem,
  TmdbWatchProviders,
} from "@/lib/media/providers/tmdb/types";

const OFFER_TYPES = ["flatrate", "free", "ads"] as const;
const CHECK_CONCURRENCY = 4;

export function isAvailableOnStudio(
  data: TmdbWatchProviders | null,
  region: string,
  providerIds: ReadonlySet<number>,
): boolean {
  const offers = data?.results?.[region];
  if (!offers) return false;
  return OFFER_TYPES.some((type) =>
    offers[type]?.some((provider) => providerIds.has(provider.provider_id)),
  );
}

/** Preserve discovery order; never display an unconfirmed or rent-only candidate. */
export async function confirmStudioAvailability(
  items: TmdbMovieListItem[],
  region: string,
  providerIds: ReadonlySet<number>,
  fetchAvailability: (id: number) => Promise<TmdbWatchProviders | null>,
) {
  const confirmed = new Array<boolean>(items.length).fill(false);
  let cursor = 0;
  let unconfirmedCount = 0;
  await Promise.all(
    Array.from({ length: Math.min(CHECK_CONCURRENCY, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index];
        if (!item) continue;
        try {
          const availability = await fetchAvailability(item.id);
          if (!availability) unconfirmedCount++;
          confirmed[index] = isAvailableOnStudio(availability, region, providerIds);
        } catch {
          unconfirmedCount++;
        }
      }
    }),
  );
  return { items: items.filter((_, index) => confirmed[index]), unconfirmedCount };
}
