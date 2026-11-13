/**
 * Minimal document-store abstraction modelled on Firestore semantics.
 *
 * The raffle service is written once against this interface and runs on
 * either Cloud Firestore (production) or an in-memory store (local demo, tests).
 *
 * Paths are slash-separated: "envs/demo/participants/p_123".
 * Inside a transaction, all reads must happen before any writes (Firestore rule).
 */
export type DocData = Record<string, unknown>;

export type Filter = [field: string, op: "==" | "in", value: unknown];

export interface QueryOptions {
  filters?: Filter[];
  orderBy?: { field: string; direction?: "asc" | "desc" };
  limit?: number;
}

export interface Transaction {
  get<T = DocData>(path: string): Promise<T | null>;
  /** Reads several docs at once (all reads before writes). */
  getAll<T = DocData>(paths: string[]): Promise<(T | null)[]>;
  set(path: string, data: DocData): void;
  update(path: string, data: DocData): void;
  /** Fails the transaction if the document already exists. */
  create(path: string, data: DocData): void;
  delete(path: string): void;
}

export type WriteOp =
  | { type: "set"; path: string; data: DocData }
  | { type: "update"; path: string; data: DocData }
  | { type: "delete"; path: string };

export interface DocStore {
  readonly kind: "memory" | "firestore";
  get<T = DocData>(path: string): Promise<T | null>;
  query<T = DocData>(collectionPath: string, options?: QueryOptions): Promise<T[]>;
  count(collectionPath: string, filters?: Filter[]): Promise<number>;
  runTransaction<R>(fn: (tx: Transaction) => Promise<R>): Promise<R>;
  /** Non-atomic bulk write, chunked to respect backend limits. */
  bulkWrite(ops: WriteOp[]): Promise<void>;
  /** Deletes every document in a collection (used only for demo reset). */
  deleteCollection(collectionPath: string): Promise<number>;
}

export class AlreadyExistsError extends Error {
  constructor(path: string) {
    super(`Document already exists: ${path}`);
    this.name = "AlreadyExistsError";
  }
}
