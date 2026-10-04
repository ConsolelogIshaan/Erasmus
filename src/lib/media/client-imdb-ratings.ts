"use client";

type Pending = { resolve: (rating: number | null) => void; promise: Promise<number | null> };
const cache = new Map<string, { rating: number | null; expires: number }>();
const pending = new Map<string, Pending>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;

async function flush() {
  timer = undefined;
  if (flushing) return;
  flushing = true;
  try {
    while (pending.size) {
      const batch = [...pending.entries()].slice(0, 30);
      let ratings: Record<string, number | null> = {};
      try {
        const response = await fetch(`/api/media/imdb-ratings?${new URLSearchParams({ items: batch.map(([key]) => key).join(",") })}`, {
          signal: AbortSignal.timeout(90000),
        });
        if (response.ok) ratings = await response.json();
      } catch { /* Missing ratings never fall back to another provider. */ }
      for (const [key, entry] of batch) {
        const value = ratings[key];
        const rating = typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 10 ? value : null;
        cache.set(key, { rating, expires: Date.now() + (rating == null ? 300_000 : 86_400_000) });
        pending.delete(key);
        entry.resolve(rating);
      }
    }
  } finally { flushing = false; }
}

export function fetchClientImdbRating(mediaType: "movie" | "tv", id: string): Promise<number | null> {
  const key = `${mediaType}:${id}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.rating);
  const existing = pending.get(key);
  if (existing) return existing.promise;
  let resolve!: Pending["resolve"];
  const promise = new Promise<number | null>((done) => { resolve = done; });
  pending.set(key, { promise, resolve });
  if (!timer && !flushing) timer = setTimeout(() => { void flush(); }, 50);
  return promise;
}
