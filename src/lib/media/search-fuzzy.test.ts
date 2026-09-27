import { describe, expect, it } from "vitest";

import {
  editDistance,
  generateQueryVariants,
  titleSimilarityScore,
} from "./search-fuzzy";

describe("generateQueryVariants", () => {
  it("collapses repeated letters", () => {
    const v = generateQueryVariants("inceptioon");
    expect(v).toContain("inception");
  });

  it("includes transpose forms for swapped letters", () => {
    const v = generateQueryVariants("batamn");
    expect(v).toContain("batman");
  });

  it("returns empty for tiny queries", () => {
    expect(generateQueryVariants("a")).toEqual([]);
  });
  it("keeps prefix recovery within the bounded query budget", () => {
    expect(generateQueryVariants("intersteler")).toContain("inte");
    expect(generateQueryVariants("inceotion")).toContain("ince");
  });
});

describe("editDistance", () => {
  it("scores near-miss titles", () => {
    expect(editDistance("inception", "inceptioon")).toBeLessThanOrEqual(2);
    expect(editDistance("batman", "batamn")).toBe(1);
  });
});

describe("titleSimilarityScore", () => {
  it("handles missing letters, substitutions, and accent punctuation normalization", () => {
    expect(titleSimilarityScore("Interstellar", "intersteler")).toBeGreaterThan(2600);
    expect(titleSimilarityScore("Inception", "inceotion")).toBeGreaterThan(2600);
    expect(titleSimilarityScore("Amélie", "amelie")).toBe(10000);
    expect(titleSimilarityScore("A Completely Unrelated Long Title", "batamn")).toBeLessThan(2600);
  });
  it("ranks exact and near matches higher", () => {
    const exact = titleSimilarityScore("Inception", "inception");
    const near = titleSimilarityScore("Inception", "inceptioon");
    const far = titleSimilarityScore("Avatar", "inceptioon");
    expect(exact).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
  });
});
