import { describe, expect, it, vi } from "vitest";
import { secureRandomIndex, selectUniform } from "@/lib/raffle/random";
import { chiSquare, chiSquareCritical } from "../support/helpers";

/**
 * Statistical checks. These give confidence that there's no obvious bias, but
 * a passing test does not mathematically prove fairness — fairness rests on
 * crypto.randomInt (uniform via rejection sampling) and on every eligible
 * participant appearing exactly once in the pool.
 */
describe("secure random selection", () => {
  it("returns indexes in range and rejects bad input", () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandomIndex(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(secureRandomIndex(1)).toBe(0);
    expect(() => secureRandomIndex(0)).toThrow();
    expect(() => secureRandomIndex(2.5)).toThrow();
  });

  it("does not use Math.random", () => {
    const spy = vi.spyOn(Math, "random");
    selectUniform([1, 2, 3], String);
    for (let i = 0; i < 100; i++) secureRandomIndex(300);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("is independent of input order", () => {
    const pool = ["c", "a", "b"];
    const pick = (p: string[]) => selectUniform(p, (x) => x, () => 0);
    expect(pick(pool)).toBe("a");
    expect(pick([...pool].reverse())).toBe("a");
  });

  it("rejects out-of-range RNG output", () => {
    expect(() => selectUniform([1, 2], String, () => 2)).toThrow(RangeError);
    expect(() => selectUniform([], String)).toThrow(RangeError);
  });

  it("shows no obvious bias across 300 participants (300,000 draws, chi-square)", () => {
    const n = 300;
    const draws = 300_000;
    const pool = Array.from({ length: n }, (_, i) => `p_${String(i).padStart(3, "0")}`);
    const index = new Map(pool.map((p, i) => [p, i]));
    const counts = new Array(n).fill(0);
    for (let i = 0; i < draws; i++) counts[index.get(selectUniform(pool, (x) => x))!]++;
    const stat = chiSquare(counts, draws / n);
    expect(stat).toBeLessThan(chiSquareCritical(n - 1));
    // Every participant was selected a plausible number of times.
    expect(Math.min(...counts)).toBeGreaterThan(draws / n / 2);
    expect(Math.max(...counts)).toBeLessThan((draws / n) * 1.5);
  });
});
