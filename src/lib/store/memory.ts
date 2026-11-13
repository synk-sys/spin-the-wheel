import { promises as fs } from "node:fs";
import path from "node:path";
import {
  AlreadyExistsError,
  type DocData,
  type DocStore,
  type Filter,
  type QueryOptions,
  type Transaction,
  type WriteOp,
} from "./types";

function clone<T>(v: T): T {
  return structuredClone(v);
}

function parentOf(docPath: string): string {
  const i = docPath.lastIndexOf("/");
  return i === -1 ? "" : docPath.slice(0, i);
}

function matches(doc: DocData, filters: Filter[] = []): boolean {
  return filters.every(([field, op, value]) => {
    const v = doc[field];
    if (op === "==") return v === value;
    if (op === "in") return Array.isArray(value) && value.includes(v);
    return false;
  });
}

/**
 * In-memory document store with serialized transactions.
 *
 * Transactions run one at a time (a promise-chain mutex), which gives the
 * same guarantees Firestore's optimistic concurrency provides: a transaction
 * either commits against the state it read or does not commit at all.
 * Optionally persists to a JSON file so local demo data survives restarts.
 */
export class MemoryStore implements DocStore {
  readonly kind = "memory" as const;
  private docs = new Map<string, DocData>();
  private chain: Promise<unknown> = Promise.resolve();
  private loaded = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly persistFile: string | null = null) {}

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.persistFile) return;
    try {
      const raw = await fs.readFile(this.persistFile, "utf8");
      const obj = JSON.parse(raw) as Record<string, DocData>;
      for (const [k, v] of Object.entries(obj)) this.docs.set(k, v);
    } catch {
      // No file yet: start empty.
    }
  }

  private schedulePersist() {
    if (!this.persistFile || this.persistTimer) return;
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      const file = this.persistFile!;
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(Object.fromEntries(this.docs)), "utf8");
      await fs.rename(tmp, file);
    }, 200);
  }

  private exclusive<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  async get<T = DocData>(p: string): Promise<T | null> {
    await this.ensureLoaded();
    const d = this.docs.get(p);
    return d ? (clone(d) as T) : null;
  }

  async query<T = DocData>(collectionPath: string, options: QueryOptions = {}): Promise<T[]> {
    await this.ensureLoaded();
    let out: DocData[] = [];
    for (const [k, v] of this.docs) {
      if (parentOf(k) === collectionPath && matches(v, options.filters)) out.push(v);
    }
    if (options.orderBy) {
      const { field, direction = "asc" } = options.orderBy;
      const dir = direction === "asc" ? 1 : -1;
      out.sort((a, b) => {
        const av = a[field] as number | string;
        const bv = b[field] as number | string;
        return av < bv ? -dir : av > bv ? dir : 0;
      });
    }
    if (options.limit !== undefined) out = out.slice(0, options.limit);
    return out.map((d) => clone(d) as T);
  }

  async count(collectionPath: string, filters?: Filter[]): Promise<number> {
    return (await this.query(collectionPath, { filters })).length;
  }

  runTransaction<R>(fn: (tx: Transaction) => Promise<R>): Promise<R> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      const writes: WriteOp[] = [];
      const creates = new Set<string>();
      let wrote = false;
      const read = (p: string) => {
        if (wrote) throw new Error("Transaction reads must happen before writes");
        const d = this.docs.get(p);
        return d ? clone(d) : null;
      };
      const tx: Transaction = {
        get: async <T = DocData>(p: string) => read(p) as T | null,
        getAll: async <T = DocData>(ps: string[]) => ps.map((p) => read(p) as T | null),
        set: (p, data) => {
          wrote = true;
          writes.push({ type: "set", path: p, data: clone(data) });
        },
        update: (p, data) => {
          wrote = true;
          writes.push({ type: "update", path: p, data: clone(data) });
        },
        create: (p, data) => {
          wrote = true;
          creates.add(p);
          writes.push({ type: "set", path: p, data: clone(data) });
        },
        delete: (p) => {
          wrote = true;
          writes.push({ type: "delete", path: p });
        },
      };
      const result = await fn(tx);
      for (const p of creates) if (this.docs.has(p)) throw new AlreadyExistsError(p);
      for (const op of writes) {
        if (op.type === "update" && !this.docs.has(op.path)) {
          throw new Error(`Cannot update missing document: ${op.path}`);
        }
      }
      this.apply(writes);
      return result;
    });
  }

  private apply(ops: WriteOp[]) {
    for (const op of ops) {
      if (op.type === "set") this.docs.set(op.path, op.data);
      else if (op.type === "update") this.docs.set(op.path, { ...this.docs.get(op.path), ...op.data });
      else this.docs.delete(op.path);
    }
    if (ops.length) this.schedulePersist();
  }

  bulkWrite(ops: WriteOp[]): Promise<void> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      this.apply(ops.map((o) => ("data" in o ? { ...o, data: clone(o.data) } : o)));
    });
  }

  deleteCollection(collectionPath: string): Promise<number> {
    return this.exclusive(async () => {
      await this.ensureLoaded();
      const ops: WriteOp[] = [];
      for (const k of this.docs.keys()) if (parentOf(k) === collectionPath) ops.push({ type: "delete", path: k });
      this.apply(ops);
      return ops.length;
    });
  }

  /** Test helper: snapshot of every stored path. */
  dumpPaths(): string[] {
    return [...this.docs.keys()].sort();
  }
}
