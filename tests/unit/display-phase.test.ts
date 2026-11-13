import { describe, expect, it } from "vitest";
import { CELEBRATE_WINDOW_MS, clockOffset, derivePhase } from "@/lib/display/phase";
import type { PublicDisplayState } from "@/lib/domain/types";
import { makeService, ORGANIZER, key, seedParticipants } from "../support/helpers";

const T0 = 1_800_000_000_000;

function state(overrides: Partial<PublicDisplayState> = {}): PublicDisplayState {
  return {
    env: "demo",
    isDemo: true,
    raffleStatus: "ready",
    currentPrize: null,
    eligibleCount: 10,
    winnerCount: 1,
    prizesRemaining: 3,
    spin: { spinId: "draw_1", drawNumber: 1, startedAt: T0, durationMs: 7000, fromRotation: 0, toRotation: 2600, targetSegment: 3 },
    reveal: { drawId: "draw_1", drawNumber: 1, winnerName: "Alex", disambiguator: "Ticket DF001", prizeName: "Swag", voided: false },
    wheelRotation: 2600,
    soundEnabled: true,
    updatedAt: T0,
    ...overrides,
  };
}

describe("projector phase (sync + reconnection)", () => {
  it("animates while the server spin is in progress", () => {
    const p = derivePhase(state(), T0 + 3000);
    expect(p).toMatchObject({ kind: "spinning", elapsedMs: 3000 });
  });

  it("joins a spin already in progress at the correct point after reconnecting", () => {
    const p = derivePhase(state(), T0 + 5500);
    expect(p.kind).toBe("spinning");
    if (p.kind === "spinning") expect(p.elapsedMs).toBe(5500);
  });

  it("reveals and celebrates right after the spin ends", () => {
    const p = derivePhase(state(), T0 + 7100);
    expect(p).toMatchObject({ kind: "reveal", celebrate: true, rotation: 2600 });
  });

  it("does not replay an old spin or its celebration after a long disconnect", () => {
    const p = derivePhase(state(), T0 + 7000 + CELEBRATE_WINDOW_MS + 60_000);
    expect(p).toMatchObject({ kind: "reveal", celebrate: false });
  });

  it("returns to the wheel when a reveal is voided or cleared", () => {
    expect(derivePhase(state({ reveal: { ...state().reveal!, voided: true } }), T0 + 9000).kind).toBe("idle");
    expect(derivePhase(state({ reveal: null }), T0 + 9000)).toEqual({ kind: "idle", rotation: 2600 });
    expect(derivePhase(null, T0)).toEqual({ kind: "idle", rotation: 0 });
  });

  it("shortens the spin for reduced-motion viewers", () => {
    expect(derivePhase(state(), T0 + 1500, true).kind).toBe("reveal");
    expect(derivePhase(state(), T0 + 1500, false).kind).toBe("spinning");
  });

  it("estimates server clock offset from a round trip", () => {
    expect(clockOffset(10_500, 10_000, 10_200)).toBe(400);
  });

  it("stays in sync with the service's published state end to end", async () => {
    const { service, clock } = makeService();
    await seedParticipants(service, 5, "demo");
    const [prize] = await service.listPrizes("demo");
    const { draw } = await service.draw("demo", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() });
    const pub = await service.getPublicDisplay("demo");
    expect(derivePhase(pub, clock.now() + 100).kind).toBe("spinning");
    const done = derivePhase(pub, clock.now() + 7500);
    expect(done.kind).toBe("reveal");
    if (done.kind === "reveal") expect(done.reveal.winnerName).toBe(draw.winnerNameSnapshot);
  });
});
