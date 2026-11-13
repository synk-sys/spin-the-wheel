import type { Firestore, Query } from "firebase-admin/firestore";
import type { DocData, DocStore, Filter, QueryOptions, Transaction, WriteOp } from "./types";

const BATCH_LIMIT = 400; // Firestore allows 500 writes per batch; keep headroom.

/** Cloud Firestore implementation of DocStore using the Firebase Admin SDK. */
export class FirestoreStore implements DocStore {
  readonly kind = "firestore" as const;

  constructor(private readonly db: Firestore) {}

  async get<T = DocData>(path: string): Promise<T | null> {
    const snap = await this.db.doc(path).get();
    return snap.exists ? (snap.data() as T) : null;
  }

  private buildQuery(collectionPath: string, options: QueryOptions = {}): Query {
    let q: Query = this.db.collection(collectionPath);
    for (const [field, op, value] of options.filters ?? []) q = q.where(field, op, value);
    if (options.orderBy) q = q.orderBy(options.orderBy.field, options.orderBy.direction ?? "asc");
    if (options.limit !== undefined) q = q.limit(options.limit);
    return q;
  }

  async query<T = DocData>(collectionPath: string, options?: QueryOptions): Promise<T[]> {
    const snap = await this.buildQuery(collectionPath, options).get();
    return snap.docs.map((d) => d.data() as T);
  }

  async count(collectionPath: string, filters?: Filter[]): Promise<number> {
    const snap = await this.buildQuery(collectionPath, { filters }).count().get();
    return snap.data().count;
  }

  runTransaction<R>(fn: (tx: Transaction) => Promise<R>): Promise<R> {
    return this.db.runTransaction(async (ftx) => {
      const tx: Transaction = {
        get: async <T = DocData>(path: string) => {
          const snap = await ftx.get(this.db.doc(path));
          return snap.exists ? (snap.data() as T) : null;
        },
        getAll: async <T = DocData>(paths: string[]) => {
          if (paths.length === 0) return [];
          const snaps = await ftx.getAll(...paths.map((p) => this.db.doc(p)));
          return snaps.map((s) => (s.exists ? (s.data() as T) : null));
        },
        set: (path, data) => void ftx.set(this.db.doc(path), data),
        update: (path, data) => void ftx.update(this.db.doc(path), data),
        create: (path, data) => void ftx.create(this.db.doc(path), data),
        delete: (path) => void ftx.delete(this.db.doc(path)),
      };
      return fn(tx);
    });
  }

  async bulkWrite(ops: WriteOp[]): Promise<void> {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const op of ops.slice(i, i + BATCH_LIMIT)) {
        const ref = this.db.doc(op.path);
        if (op.type === "set") batch.set(ref, op.data);
        else if (op.type === "update") batch.update(ref, op.data);
        else batch.delete(ref);
      }
      await batch.commit();
    }
  }

  async deleteCollection(collectionPath: string): Promise<number> {
    let total = 0;
    for (;;) {
      const snap = await this.db.collection(collectionPath).limit(BATCH_LIMIT).get();
      if (snap.empty) return total;
      const batch = this.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
    }
  }
}
