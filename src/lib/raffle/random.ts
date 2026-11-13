import { randomInt, randomUUID } from "node:crypto";

/** Returns a uniformly distributed integer in [0, maxExclusive). */
export type RandomIndex = (maxExclusive: number) => number;

/**
 * Cryptographically secure uniform index using Node's crypto.randomInt,
 * which uses rejection sampling internally (no modulo bias).
 */
export const secureRandomIndex: RandomIndex = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError("maxExclusive must be a positive integer");
  }
  if (maxExclusive === 1) return 0;
  return randomInt(0, maxExclusive);
};

/**
 * Selects one item uniformly at random. The pool is sorted by a stable key
 * first so selection never depends on query or import order.
 */
export function selectUniform<T>(pool: readonly T[], key: (item: T) => string, rng: RandomIndex = secureRandomIndex): T {
  if (pool.length === 0) throw new RangeError("Cannot select from an empty pool");
  const ordered = [...pool].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const index = rng(ordered.length);
  if (!Number.isInteger(index) || index < 0 || index >= ordered.length) {
    throw new RangeError("Random index out of range");
  }
  return ordered[index];
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
