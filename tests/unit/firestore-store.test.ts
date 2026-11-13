import { describe, expect, it, beforeAll } from "vitest";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreStore } from "@/lib/store/firestore";
import { RaffleService } from "@/lib/raffle/service";
import { ORGANIZER, ORGANIZER_2, key, seedParticipants } from "../support/helpers";

/**
 * Runs the critical draw guarantees against the real Firestore implementation.
 * Requires the Firestore emulator:
 *   npx firebase-tools emulators:exec --only firestore "npm test -- firestore-store"
 */
const enabled = !!process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!enabled)("FirestoreStore (emulator)", () => {
  let service: RaffleService;
  let t = 1_800_000_000_000;

  beforeAll(async () => {
    const app = getApps()[0] ?? initializeApp({ projectId: "demo-devfest-raffle" });
    const db = getFirestore(app);
    // Clear any previous run.
    for (const env of ["production", "demo"]) {
      for (const c of ["participants", "prizes", "draws", "raffleState", "auditLogs", "imports", "idempotency"]) {
        await new FirestoreStore(db).deleteCollection(`envs/${env}/${c}`);
      }
    }
    service = new RaffleService(new FirestoreStore(db), { now: () => t, seedDefaultPrizes: false });
  });

  it("imports, draws uniformly from the pool, and is idempotent", async () => {
    await seedParticipants(service, 25);
    const prize = await service.createPrize("production", ORGANIZER, { name: "Emulator prize", quantity: 3 });
    const k = key();
    const first = await service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: k });
    const replay = await service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: k });
    expect(first.draw.eligiblePoolSize).toBe(25);
    expect(replay.replayed).toBe(true);
    expect(replay.draw.drawId).toBe(first.draw.drawId);
    t += 10_000;
  });

  it("serializes concurrent draws so only one wins", async () => {
    const [prize] = await service.listPrizes("production");
    const results = await Promise.allSettled([
      service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() }),
      service.draw("production", ORGANIZER_2, { prizeId: prize.prizeId, idempotencyKey: key() }),
      service.draw("production", ORGANIZER, { prizeId: prize.prizeId, idempotencyKey: key() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const draws = await service.listDraws("production");
    expect(new Set(draws.map((d) => d.participantId)).size).toBe(draws.length);
    t += 10_000;
  });

  it("voids without deleting history and keeps the winner excluded", async () => {
    const draws = await service.listDraws("production");
    const last = draws.at(-1)!;
    const voided = await service.updateDrawStatus("production", ORGANIZER, last.drawId, "void", "Emulator test");
    expect(voided.status).toBe("voided");
    const p = (await service.listParticipants("production")).find((x) => x.participantId === last.participantId)!;
    expect(p.eligibilityStatus).toBe("ineligible");
    expect(await service.listDraws("production")).toHaveLength(draws.length);
  });
});
