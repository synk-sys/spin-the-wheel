import { describe, expect, it, beforeAll } from "vitest";
import { initializeApp as adminInit, getApps as adminApps } from "firebase-admin/app";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, collection, getDocs } from "firebase/firestore";

/**
 * Verifies firestore.rules against the emulator: anonymous browsers may read
 * only the projector-safe document, and can write nothing.
 *   npm run test:emulator
 */
const host = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!host)("Firestore security rules (emulator)", () => {
  const projectId = "demo-devfest-raffle";
  let client: ReturnType<typeof getFirestore>;

  beforeAll(async () => {
    const admin = adminDb(adminApps()[0] ?? adminInit({ projectId }));
    await admin.doc("publicDisplay/demo").set({ env: "demo", winnerCount: 0 });
    await admin.doc("envs/production/participants/p1").set({ name: "Private Person", email: "private@example.com" });
    const app = initializeApp({ projectId, apiKey: "fake-key" }, "rules-test");
    client = getFirestore(app);
    const [h, p] = host!.split(":");
    connectFirestoreEmulator(client, h, Number(p));
  });

  it("allows reading the public display document", async () => {
    const snap = await getDoc(doc(client, "publicDisplay/demo"));
    expect(snap.exists()).toBe(true);
  });

  it("denies reading participants, draws, and audit logs", async () => {
    await expect(getDoc(doc(client, "envs/production/participants/p1"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(client, "envs/production/participants"))).rejects.toMatchObject({ code: "permission-denied" });
    await expect(getDocs(collection(client, "envs/production/auditLogs"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("denies all client writes, including to the public document", async () => {
    await expect(setDoc(doc(client, "publicDisplay/demo"), { hacked: true })).rejects.toMatchObject({ code: "permission-denied" });
    await expect(setDoc(doc(client, "envs/production/draws/d1"), { winner: "me" })).rejects.toMatchObject({ code: "permission-denied" });
  });
});
