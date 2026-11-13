import "server-only";
import path from "node:path";
import { MemoryStore } from "./memory";
import type { DocStore } from "./types";

const globalForStore = globalThis as unknown as { __raffleStore?: DocStore };

export function dataBackend(): "memory" | "firestore" {
  return process.env.DATA_BACKEND === "firestore" ? "firestore" : "memory";
}

/**
 * Returns the process-wide store. Production deployments must set
 * DATA_BACKEND=firestore; the in-memory store is for local demos and tests.
 */
export async function getStore(): Promise<DocStore> {
  if (globalForStore.__raffleStore) return globalForStore.__raffleStore;
  let store: DocStore;
  if (dataBackend() === "firestore") {
    const [{ FirestoreStore }, { adminDb }] = await Promise.all([import("./firestore"), import("../firebase/admin")]);
    store = new FirestoreStore(adminDb());
  } else {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MEMORY_BACKEND !== "true") {
      throw new Error("DATA_BACKEND=firestore is required in production (set ALLOW_MEMORY_BACKEND=true to override for local testing).");
    }
    const file = process.env.MEMORY_STORE_FILE ?? path.join(process.cwd(), ".data", "raffle-store.json");
    store = new MemoryStore(file === "" ? null : file);
  }
  globalForStore.__raffleStore = store;
  return store;
}
