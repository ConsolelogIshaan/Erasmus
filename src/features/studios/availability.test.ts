import { describe, expect, it } from "vitest";
import type {
  TmdbMovieListItem,
  TmdbProvider,
  TmdbWatchProviders,
} from "@/lib/media/providers/tmdb/types";
import { confirmStudioAvailability, isAvailableOnStudio } from "./availability";

const netflix = new Set([8, 175, 1796]);
const provider = (id: number): TmdbProvider => ({
  provider_id: id,
  provider_name: String(id),
  logo_path: null,
});
const item = (id: number): TmdbMovieListItem => ({
  id,
  title: String(id),
  poster_path: null,
  backdrop_path: null,
});
const offered = (id: number): TmdbWatchProviders => ({
  results: { IN: { flatrate: [provider(id)] } },
});

describe("strict Studios availability", () => {
  it("accepts only matching direct service plans in the selected region", () => {
    expect(isAvailableOnStudio(offered(8), "IN", netflix)).toBe(true);
    expect(isAvailableOnStudio(offered(1796), "IN", netflix)).toBe(true);
    expect(isAvailableOnStudio(offered(15), "IN", netflix)).toBe(false);
    expect(isAvailableOnStudio(offered(8), "US", netflix)).toBe(false);
  });
  it("rejects rental, purchase, unrelated channels and missing records", () => {
    const data = {
      results: {
        IN: { rent: [provider(8)], buy: [provider(8)], flatrate: [provider(2243)] },
      },
    };
    expect(isAvailableOnStudio(data, "IN", netflix)).toBe(false);
    expect(isAvailableOnStudio(null, "IN", netflix)).toBe(false);
    expect(isAvailableOnStudio({ results: {} }, "IN", netflix)).toBe(false);
  });
  it("accepts matching ad-supported and free streaming offers", () => {
    expect(
      isAvailableOnStudio({ results: { IN: { ads: [provider(8)] } } }, "IN", netflix),
    ).toBe(true);
    expect(
      isAvailableOnStudio({ results: { IN: { free: [provider(8)] } } }, "IN", netflix),
    ).toBe(true);
  });
  it("omits failed/null lookups and mismatches while preserving discovery order", async () => {
    const result = await confirmStudioAvailability(
      [1, 2, 3, 4, 5].map(item),
      "IN",
      netflix,
      async (id) => {
        if (id === 2) throw new Error("Unavailable upstream");
        if (id === 3) return null;
        return offered(id === 4 ? 15 : 8);
      },
    );
    expect(result.items.map((item) => item.id)).toEqual([1, 5]);
    expect(result.unconfirmedCount).toBe(2);
  });
  it("limits concurrent verification requests to four", async () => {
    let active = 0;
    let maximum = 0;
    const result = await confirmStudioAvailability(
      Array.from({ length: 20 }, (_, i) => item(i + 1)),
      "IN",
      netflix,
      async () => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return offered(8);
      },
    );
    expect(maximum).toBe(4);
    expect(result.items).toHaveLength(20);
  });
  it("makes no requests for an empty candidate page", async () => {
    const result = await confirmStudioAvailability([], "IN", netflix, async () => {
      throw new Error("Must not run");
    });
    expect(result).toEqual({ items: [], unconfirmedCount: 0 });
  });
});
