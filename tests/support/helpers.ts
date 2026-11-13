import { MemoryStore } from "@/lib/store/memory";
import { RaffleService, type Actor, type ServiceOptions } from "@/lib/raffle/service";
import type { RaffleEnv } from "@/lib/domain/types";

export const ORGANIZER: Actor = { uid: "u1", email: "organizer@example.com" };
export const ORGANIZER_2: Actor = { uid: "u2", email: "second@example.com" };

/** A controllable clock so spin-cooldown windows can be skipped instantly. */
export function fakeClock(start = 1_800_000_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

export function makeService(opts: ServiceOptions = {}) {
  const store = new MemoryStore(null);
  const clock = fakeClock();
  const service = new RaffleService(store, { now: clock.now, ...opts });
  return { store, clock, service };
}

let keyCounter = 0;
export const key = () => `test-key-${++keyCounter}-${Math.random().toString(36).slice(2, 10)}`;

/** Creates N plain participants in an env (production by default). */
export async function seedParticipants(service: RaffleService, n: number, env: RaffleEnv = "production") {
  const rows = Array.from({ length: n }, (_, i) => ({
    attendeeId: `A${i}`,
    name: `Person ${i}`,
    email: `p${i}@example.com`,
    ticketNumber: `T${i}`,
    company: "",
  }));
  return service.importParticipants(env, ORGANIZER, { rows, fileName: "seed.csv" });
}

/**
 * Chi-square goodness-of-fit critical value via the Wilson–Hilferty
 * approximation. z = 3.29 ≈ one-sided p of 0.0005, keeping flaky failures rare.
 */
export function chiSquareCritical(df: number, z = 3.29): number {
  const a = 2 / (9 * df);
  return df * Math.pow(1 - a + z * Math.sqrt(a), 3);
}

export function chiSquare(counts: number[], expected: number): number {
  return counts.reduce((s, c) => s + ((c - expected) * (c - expected)) / expected, 0);
}
