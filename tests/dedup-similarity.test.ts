import { describe, expect, it } from "vitest";
import { jaroSimilarity, jaroWinklerSimilarity } from "../src/dedup/similarity.js";

describe("jaroSimilarity", () => {
  it("returns 1 for identical strings", () => expect(jaroSimilarity("acme", "acme")).toBe(1));
  it("returns 0 when either string is empty", () => expect(jaroSimilarity("acme", "")).toBe(0));
  it("matches the standard MARTHA/MARHTA reference value", () => expect(jaroSimilarity("MARTHA", "MARHTA")).toBeCloseTo(0.9444, 3));
  it("matches the standard DIXON/DICKSONX reference value", () => expect(jaroSimilarity("DIXON", "DICKSONX")).toBeCloseTo(0.7667, 3));
});

describe("jaroWinklerSimilarity", () => {
  it("boosts scores for a shared prefix over plain Jaro", () => {
    expect(jaroWinklerSimilarity("MARTHA", "MARHTA")).toBeGreaterThan(jaroSimilarity("MARTHA", "MARHTA"));
  });
  it("matches the standard DIXON/DICKSONX reference value", () => expect(jaroWinklerSimilarity("DIXON", "DICKSONX")).toBeCloseTo(0.8133, 3));
  it("returns 1 for identical strings", () => expect(jaroWinklerSimilarity("acme corp", "acme corp")).toBe(1));
});
