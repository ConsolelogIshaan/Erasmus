import { describe, expect, it, vi, beforeEach } from "vitest";
import { tmdbFetch } from "./client";
import { TmdbMediaProvider } from "./provider";

vi.mock("./client", () => ({ tmdbFetch: vi.fn(), isTmdbConfigured: () => true }));

describe("catalog typo recovery", () => {
  beforeEach(() => vi.resetAllMocks());
  it("finds the intended title despite unrelated primary results and deduplicates fallback hits", async () => {
    vi.mocked(tmdbFetch).mockImplementation(async (path, params) => {
      if (path.includes("/genre/")) return { genres: [] } as never;
      const results =
        path === "/search/multi"
          ? params?.query === "intersteler"
            ? [{ id: 2, media_type: "movie", title: "Unrelated", popularity: 1 }]
            : [{ id: 1, media_type: "movie", title: "Interstellar", popularity: 100 }]
          : [];
      return { page: 1, results, total_pages: 1, total_results: results.length } as never;
    });
    const response = await new TmdbMediaProvider().search("intersteler");
    expect(response.results[0]?.title).toBe("Interstellar");
    expect(response.results.filter((item) => item.id === "1")).toHaveLength(1);
  });
  it("does not fan out fallback queries for an exact match", async () => {
    vi.mocked(tmdbFetch).mockImplementation(async (path) => {
      if (path.includes("/genre/")) return { genres: [] } as never;
      return {
        page: 1,
        results:
          path === "/search/multi"
            ? [{ id: 1, media_type: "movie", title: "Inception" }]
            : [],
        total_pages: 1,
        total_results: 1,
      } as never;
    });
    await new TmdbMediaProvider().search("Inception");
    expect(
      vi.mocked(tmdbFetch).mock.calls.filter(([path]) => path === "/search/multi"),
    ).toHaveLength(1);
  });
});
