import { describe, expect, it, vi } from "vitest";
import { RaffleService } from "@/lib/raffle/service";
import { MemoryStore } from "@/lib/store/memory";
import { paths } from "@/lib/raffle/paths";
import { RaffleError } from "@/lib/domain/errors";
import { chiSquare, chiSquareCritical, key, makeService, ORGANIZER, ORGANIZER_2, seedParticipants } from "../support/helpers";

const SPIN = 7000;

async function setup(n = 10, quantity = 3) {
  const ctx = makeService();
  await seedParticipants(ctx.service, n);
  const prize = await ctx.service.createPrize("production", ORGANIZER, { name: "Swag", quantity });
  return { ...ctx, prize };
}

async function spin(ctx: Awaited<ReturnType<typeof setup>>, prizeId = ctx.prize.prizeId, actor = ORGANIZER) {
  const r = await ctx.service.draw("production", actor, { prizeId, idempotencyKey: key() });
  ctx.clock.advance(SPIN + 1);
  return r;
}

describe("eligibility filtering", () => {
  it("only draws eligible participants", async () => {
    const ctx = await setup(5, 5);
    const people = await ctx.service.listParticipants("production");
    await ctx.service.updateParticipant("production", ORGANIZER, people[0].participantId, { eligibilityStatus: "ineligible" });
    await ctx.service.updateParticipant("production", ORGANIZER, people[1].participantId, { eligibilityStatus: "removed" });
    const winners = new Set<string>();
    for (let i = 0; i < 3; i++) winners.add((await spin(ctx)).draw.participantId);
    expect(winners.has(people[0].participantId)).toBe(false);
    expect(winners.has(people[1].participantId)).toBe(false);
    expect(winners.size).toBe(3);
  });

  it("records the exact eligible pool size, organizer, timestamp and prize", async () => {
    const ctx = await setup(10, 3);
    const first = (await spin(ctx)).draw;
    expect(first).toMatchObject({ eligiblePoolSize: 10, initiatedBy: ORGANIZER.email, prizeId: ctx.prize.prizeId, drawNumber: 1, status: "selected" });
    expect(first.createdAt).toBeGreaterThan(0);
    const second = (await spin(ctx)).draw;
    expect(second.eligiblePoolSize).toBe(9);
    expect(second.drawNumber).toBe(2);
  });
});

describe("no-repeat winners and quantities", () => {
  it("never selects the same participant twice", async () => {
    const ctx = await setup(20, 20);
    const ids = [];
    for (let i = 0; i < 20; i++) ids.push((await spin(ctx)).draw.participantId);
    expect(new Set(ids).size).toBe(20);
    await expect(spin(ctx)).rejects.toMatchObject({ code: "PRIZE_EXHAUSTED" });
  });

  it("supports multiple winners per prize and stops at the quantity", async () => {
    const ctx = await setup(10, 2);
    await spin(ctx);
    await spin(ctx);
    await expect(spin(ctx)).rejects.toMatchObject({ code: "PRIZE_EXHAUSTED" });
    const [prize] = await ctx.service.listPrizes("production");
    expect(prize).toMatchObject({ remainingQuantity: 0, status: "awarded", drawCount: 2 });
  });

  it("fails cleanly when nobody is eligible, consuming nothing", async () => {
    const ctx = await setup(2, 5);
    await spin(ctx);
    await spin(ctx);
    await expect(spin(ctx)).rejects.toMatchObject({ code: "NO_ELIGIBLE_PARTICIPANTS" });
    const [prize] = await ctx.service.listPrizes("production");
    expect(prize.remainingQuantity).toBe(3);
    expect(await ctx.service.listDraws("production")).toHaveLength(2);
  });

  it("blocks drawing while paused", async () => {
    const ctx = await setup(5, 2);
    await ctx.service.setPaused("production", ORGANIZER, true);
    await expect(spin(ctx)).rejects.toMatchObject({ code: "RAFFLE_PAUSED" });
    await ctx.service.setPaused("production", ORGANIZER, false);
    await expect(spin(ctx)).resolves.toBeTruthy();
  });

  it("blocks a new spin while the wheel is still spinning", async () => {
    const ctx = await setup(5, 3);
    await ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: key() });
    await expect(ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: key() })).rejects.toMatchObject({
      code: "DRAW_IN_PROGRESS",
    });
  });
});

describe("concurrency and idempotency", () => {
  it("lets only one of several concurrent draws through", async () => {
    const ctx = await setup(50, 10);
    const results = await Promise.allSettled([
      ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: key() }),
      ctx.service.draw("production", ORGANIZER_2, { prizeId: ctx.prize.prizeId, idempotencyKey: key() }),
      ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: key() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(RaffleError);
      expect((r as PromiseRejectedResult).reason.code).toBe("DRAW_IN_PROGRESS");
    }
    expect(await ctx.service.listDraws("production")).toHaveLength(1);
    const [prize] = await ctx.service.listPrizes("production");
    expect(prize.remainingQuantity).toBe(9);
  });

  it("returns the original result for a retried request with the same idempotency key", async () => {
    const ctx = await setup(10, 3);
    const k = key();
    const first = await ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: k });
    const retry = await ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: k });
    expect(retry.replayed).toBe(true);
    expect(retry.draw.drawId).toBe(first.draw.drawId);
    expect(await ctx.service.listDraws("production")).toHaveLength(1);
    const [prize] = await ctx.service.listPrizes("production");
    expect(prize.remainingQuantity).toBe(2);
  });

  it("detects eligibility changes between selection and commit and reselects", async () => {
    let changed = false;
    const store = new MemoryStore(null);
    let t = 1_800_000_000_000;
    let excluded: string | null = null;
    // Always pick index 0 so we know who the first selection is.
    const service: RaffleService = new RaffleService(store, {
      seedDefaultPrizes: false,
      now: () => t,
      rng: () => 0,
      beforeCommit: async () => {
        if (changed) return;
        changed = true;
        const pool = (await service.listParticipants("production")).sort((a, b) => (a.participantId < b.participantId ? -1 : 1));
        excluded = pool[0].participantId;
        // A second organizer makes the about-to-win participant ineligible.
        await service.updateParticipant("production", ORGANIZER_2, excluded, { eligibilityStatus: "ineligible" });
      },
    });
    await seedParticipants(service, 5);
    const prize = await service.createPrize("production", ORGANIZER, { name: "P", quantity: 1 });
    const { draw } = await service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() });
    expect(excluded).not.toBeNull();
    expect(draw.participantId).not.toBe(excluded);
    expect(draw.eligiblePoolSize).toBe(4);
    t += SPIN;
  });

  it("releases the lock and consumes nothing when a draw fails", async () => {
    const ctx = makeService({
      rng: () => {
        throw new Error("rng failure");
      },
    });
    await seedParticipants(ctx.service, 3);
    const prize = await ctx.service.createPrize("production", ORGANIZER, { name: "P", quantity: 1 });
    await expect(ctx.service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() })).rejects.toThrow("rng failure");
    const state = await ctx.service.getState("production");
    expect(state.drawLock).toBeNull();
    expect((await ctx.service.listPrizes("production"))[0].remainingQuantity).toBe(1);
    expect((await ctx.service.listParticipants("production")).every((p) => p.eligibilityStatus === "eligible")).toBe(true);
  });

  it("never calls Math.random during a draw", async () => {
    const ctx = await setup(10, 1);
    const spy = vi.spyOn(Math, "random");
    await ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: "fixed-key-123" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("winner lifecycle and history", () => {
  it("moves through Selected → Announced → Confirmed → Claimed", async () => {
    const ctx = await setup(5, 1);
    const { draw } = await spin(ctx);
    for (const [action, status] of [
      ["announce", "announced"],
      ["confirm", "confirmed"],
      ["claim", "claimed"],
    ] as const) {
      const d = await ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, action);
      expect(d.status).toBe(status);
    }
    const [prize] = await ctx.service.listPrizes("production");
    expect(prize.status).toBe("claimed");
    await expect(ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, "void", "late")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("voiding keeps the record, restores the prize, and keeps the person excluded", async () => {
    const ctx = await setup(5, 1);
    const { draw } = await spin(ctx);
    await ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, "absent");
    await expect(ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, "void")).rejects.toMatchObject({ code: "VALIDATION" });
    const voided = await ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, "void", "Not present after 3 calls");
    expect(voided).toMatchObject({ status: "voided", voidReason: "Not present after 3 calls" });
    expect(voided.statusHistory.map((h) => h.status)).toEqual(["selected", "absent", "voided"]);
    // Original result fields are untouched.
    expect(voided).toMatchObject({ participantId: draw.participantId, winnerNameSnapshot: draw.winnerNameSnapshot, eligiblePoolSize: 5 });

    const [prize] = await ctx.service.listPrizes("production");
    expect(prize.remainingQuantity).toBe(1);
    const person = (await ctx.service.listParticipants("production")).find((p) => p.participantId === draw.participantId)!;
    expect(person).toMatchObject({ eligibilityStatus: "ineligible", ineligibleReason: "voided-draw" });

    // Redraw never returns the voided winner.
    const redraw = (await spin(ctx)).draw;
    expect(redraw.participantId).not.toBe(draw.participantId);
    expect(redraw.eligiblePoolSize).toBe(4);

    const history = await ctx.service.listDraws("production");
    expect(history.map((d) => [d.drawNumber, d.status])).toEqual([
      [1, "voided"],
      [2, "selected"],
    ]);
    const audit = (await ctx.service.listAudit("production")).map((a) => a.eventType);
    expect(audit).toEqual(expect.arrayContaining(["draw.created", "draw.absent", "draw.voided"]));
  });

  it("restoring a voided winner is a separate explicit action", async () => {
    const ctx = await setup(3, 2);
    const { draw } = await spin(ctx);
    await ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, "void", "Duplicate badge");
    await ctx.service.updateParticipant("production", ORGANIZER, draw.participantId, { eligibilityStatus: "eligible" });
    const p = (await ctx.service.listParticipants("production")).find((x) => x.participantId === draw.participantId)!;
    expect(p.eligibilityStatus).toBe("eligible");
  });

  it("prevents changing a current winner's eligibility without voiding", async () => {
    const ctx = await setup(3, 1);
    const { draw } = await spin(ctx);
    await expect(ctx.service.updateParticipant("production", ORGANIZER, draw.participantId, { eligibilityStatus: "eligible" })).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });

  it("does not allow deleting a prize with draw history", async () => {
    const ctx = await setup(3, 1);
    await spin(ctx);
    await expect(ctx.service.deletePrize("production", ORGANIZER, ctx.prize.prizeId)).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });
});

describe("imports", () => {
  it("rejects importing the same file twice", async () => {
    const ctx = makeService();
    const first = await seedParticipants(ctx.service, 5);
    expect(first.imported).toBe(5);
    await expect(seedParticipants(ctx.service, 5)).rejects.toMatchObject({ code: "DUPLICATE_IMPORT" });
    expect(await ctx.service.listParticipants("production")).toHaveLength(5);
  });

  it("skips duplicates against existing participants and within the file", async () => {
    const ctx = makeService();
    await seedParticipants(ctx.service, 3);
    const r = await ctx.service.importParticipants("production", ORGANIZER, {
      rows: [
        { name: "New Person", email: "new@example.com" },
        { name: "Dup Existing", email: "p0@example.com" },
        { name: "Dup In File", email: "NEW@example.com" },
        { name: "" },
      ],
    });
    expect(r.imported).toBe(1);
    expect(r.skipped.map((s) => s.index)).toEqual([1, 2, 3]);
  });

  it("imports an explicitly overridden duplicate", async () => {
    const ctx = makeService();
    const r = await ctx.service.importParticipants("production", ORGANIZER, {
      rows: [
        { name: "Partner A", email: "household@example.com" },
        { name: "Partner B", email: "household@example.com" },
      ],
      overrideDuplicates: [1],
    });
    expect(r.imported).toBe(2);
  });

  it("imports 300 attendees and draws from all of them", async () => {
    const ctx = makeService();
    await seedParticipants(ctx.service, 300);
    const prize = await ctx.service.createPrize("production", ORGANIZER, { name: "Grand", quantity: 1 });
    const { draw } = await ctx.service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() });
    expect(draw.eligiblePoolSize).toBe(300);
  });
});

describe("demo and production isolation", () => {
  it("keeps demo and production data in separate namespaces", async () => {
    const ctx = makeService();
    await seedParticipants(ctx.service, 4, "production");
    const demoState = await ctx.service.getState("demo"); // seeds 300 demo attendees
    expect(demoState.env).toBe("demo");
    expect(await ctx.service.listParticipants("demo")).toHaveLength(300);
    expect(await ctx.service.listParticipants("production")).toHaveLength(4);

    const [demoPrize] = await ctx.service.listPrizes("demo");
    await ctx.service.draw("demo", ORGANIZER, { prizeId: demoPrize.prizeId, idempotencyKey: key() });
    ctx.clock.advance(SPIN + 1);
    await ctx.service.resetDemo("demo", ORGANIZER, "RESET DEMO");

    expect(await ctx.service.listDraws("production")).toHaveLength(0);
    expect(await ctx.service.listParticipants("production")).toHaveLength(4);
    expect(await ctx.service.listDraws("demo")).toHaveLength(0);
    // Demo writes never land outside the demo namespace (or its public doc).
    const touched = ctx.store.dumpPaths().filter((p) => p.includes("demo"));
    expect(touched.every((p) => p.startsWith("envs/demo/") || p === "publicDisplay/demo")).toBe(true);
  });

  it("refuses to reset production or to reset without the confirmation phrase", async () => {
    const ctx = makeService();
    await expect(ctx.service.resetDemo("production", ORGANIZER, "RESET DEMO")).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(ctx.service.resetDemo("demo", ORGANIZER, "yes")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("projector state", () => {
  it("publishes spin + reveal without any private participant data", async () => {
    const ctx = await setup(5, 2);
    const { draw } = await ctx.service.draw("production", ORGANIZER, { prizeId: ctx.prize.prizeId, idempotencyKey: key() });
    const pub = await ctx.store.get(paths.publicDisplay("production"));
    expect(pub).toMatchObject({
      spin: { spinId: draw.drawId, durationMs: SPIN, drawNumber: 1 },
      reveal: { drawId: draw.drawId, winnerName: draw.winnerNameSnapshot, disambiguator: `Ticket ${draw.ticketNumberSnapshot}` },
      eligibleCount: 4,
      currentPrize: { name: "Swag", remainingQuantity: 1 },
    });
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/@example\.com/);
    expect(json).not.toContain(draw.participantId);
  });

  it("disambiguates winners who share a name", async () => {
    const ctx = makeService({ rng: () => 0 });
    await ctx.service.importParticipants("production", ORGANIZER, {
      rows: [
        { name: "Sam Patel", attendeeId: "X1" },
        { name: "Sam Patel", attendeeId: "X2" },
      ],
    });
    const prize = await ctx.service.createPrize("production", ORGANIZER, { name: "P", quantity: 1 });
    const { draw } = await ctx.service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() });
    expect(["ID X1", "ID X2"]).toContain(draw.displayDisambiguator);
  });

  it("marks a voided reveal so the projector hides it", async () => {
    const ctx = await setup(5, 1);
    const { draw } = await spin(ctx);
    await ctx.service.updateDrawStatus("production", ORGANIZER, draw.drawId, "void", "Testing void");
    const pub = await ctx.service.getPublicDisplay("production");
    expect(pub.reveal?.voided).toBe(true);
  });
});

describe("fairness simulation through the full draw path", () => {
  it("shows no obvious first-draw bias across 10 participants (3,000 independent raffles)", async () => {
    const runs = 3000;
    const counts = new Map<string, number>();
    const store = new MemoryStore(null);
    const service = new RaffleService(store, { now: () => 1, seedDefaultPrizes: false });
    await seedParticipants(service, 10);
    // Quantity 1 is enough: voiding each draw returns the prize to the pool.
    const prize = await service.createPrize("production", ORGANIZER, { name: "P", quantity: 1 });
    // Each iteration draws once then voids + restores, so the pool is always the same 10 people.
    let t = 1;
    const timed = new RaffleService(store, { now: () => (t += SPIN + 1), seedDefaultPrizes: false });
    for (let i = 0; i < runs; i++) {
      const { draw } = await timed.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: `sim-${i}-aaaa` });
      counts.set(draw.participantId, (counts.get(draw.participantId) ?? 0) + 1);
      await timed.updateDrawStatus("production", ORGANIZER, draw.drawId, "void", "simulation");
      await timed.updateParticipant("production", ORGANIZER, draw.participantId, { eligibilityStatus: "eligible" });
    }
    expect(counts.size).toBe(10);
    expect(chiSquare([...counts.values()], runs / 10)).toBeLessThan(chiSquareCritical(9));
  }, 120_000);
});

describe("default prizes", () => {
  it("demo and a fresh production raffle both start with 3 one-winner prizes", async () => {
    const store = new MemoryStore(null);
    let t = 1_800_000_000_000;
    const service = new RaffleService(store, { now: () => (t += SPIN + 1) });
    for (const env of ["demo", "production"] as const) {
      const prizes = await service.listPrizes(env).then(async (p) => (p.length ? p : (await service.getState(env), service.listPrizes(env))));
      expect(prizes.map((p) => [p.name, p.quantity])).toEqual([
        ["DevFest Swag Pack", 1],
        ["Gift Card", 1],
        ["Grand Prize", 1],
      ]);
      expect((await service.getState(env)).currentPrizeId).toBe(prizes[0].prizeId);
    }
    // Demo raffle runs out after exactly 3 winners.
    for (let i = 0; i < 3; i++) {
      const prize = (await service.listPrizes("demo")).find((p) => p.remainingQuantity > 0)!;
      await service.draw("demo", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() });
    }
    const pub = await service.getPublicDisplay("demo");
    expect(pub).toMatchObject({ winnerCount: 3, prizesRemaining: 0, raffleStatus: "completed" });
  });
});
