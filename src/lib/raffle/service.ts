import { createHash } from "node:crypto";
import {
  existingKeysFrom,
  importFingerprint,
  keyOf,
  MAX_IMPORT_ROWS,
  reviewRows,
  type ImportField,
} from "../csv/import";
import { RaffleError } from "../domain/errors";
import {
  participantInputSchema,
  participantUpdateSchema,
  prizeInputSchema,
  type AuditLog,
  type Draw,
  type DrawLock,
  type DrawStatus,
  type ImportRecord,
  type Participant,
  type ParticipantInput,
  type Prize,
  type PrizeStatus,
  type PublicDisplayState,
  type PublicSpin,
  type RaffleEnv,
  type RaffleState,
} from "../domain/types";
import type { DocData, DocStore, Transaction } from "../store/types";
import { planSpin, SPIN_DURATION_MS } from "../wheel/geometry";
import { DEFAULT_PRIZES, generateDemoAttendees } from "./demo";
import { paths } from "./paths";
import { newId, secureRandomIndex, selectUniform, type RandomIndex } from "./random";

export interface Actor {
  uid: string;
  email: string;
}

export const SYSTEM_ACTOR: Actor = { uid: "system", email: "system" };

export interface ServiceOptions {
  rng?: RandomIndex;
  now?: () => number;
  spinDurationMs?: number;
  /** Hook for tests: runs between pool selection and commit. */
  beforeCommit?: () => Promise<void>;
  /** Pre-create DEFAULT_PRIZES in production on first setup (default true). */
  seedDefaultPrizes?: boolean;
}

const DRAW_LOCK_TTL_MS = 30_000;
const IMPORT_LOCK_TTL_MS = 120_000;
const MAX_POOL_RETRIES = 3;
export const MAX_PARTICIPANTS = 5000;
export const DEMO_RESET_PHRASE = "RESET DEMO";

type StateDoc = RaffleState & { lastSpin: PublicSpin | null; spinEndsAt: number };

/** Allowed draw status transitions (Selected → Announced → Confirmed → Claimed). */
const TRANSITIONS: Record<DrawStatus, DrawStatus[]> = {
  selected: ["announced", "confirmed", "absent", "voided"],
  announced: ["confirmed", "absent", "voided"],
  confirmed: ["claimed", "absent", "voided"],
  claimed: [],
  absent: ["confirmed", "voided"],
  voided: [],
};

export type DrawAction = "announce" | "confirm" | "claim" | "absent" | "void";
const ACTION_STATUS: Record<DrawAction, DrawStatus> = {
  announce: "announced",
  confirm: "confirmed",
  claim: "claimed",
  absent: "absent",
  void: "voided",
};

class StalePoolError extends Error {}

/** A prize can be drawn while it has quantity left and hasn't been closed by an organizer. */
export function isDrawable(prize: Prize): boolean {
  return prize.remainingQuantity > 0 && prize.status !== "awarded" && prize.status !== "claimed";
}

const asDoc = (v: object) => v as unknown as DocData;

function deterministicId(prefix: string, ...parts: string[]): string {
  return `${prefix}_${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`;
}

export class RaffleService {
  private readonly rng: RandomIndex;
  private readonly now: () => number;
  private readonly spinDurationMs: number;
  private readonly beforeCommit?: () => Promise<void>;
  private readonly seedDefaultPrizes: boolean;

  constructor(
    private readonly store: DocStore,
    opts: ServiceOptions = {},
  ) {
    this.rng = opts.rng ?? secureRandomIndex;
    this.now = opts.now ?? Date.now;
    this.spinDurationMs = opts.spinDurationMs ?? SPIN_DURATION_MS;
    this.beforeCommit = opts.beforeCommit;
    this.seedDefaultPrizes = opts.seedDefaultPrizes ?? true;
  }

  // ------------------------------------------------------------------ state

  private initialState(env: RaffleEnv): StateDoc {
    return {
      env,
      status: "ready",
      currentPrizeId: null,
      activeDrawId: null,
      drawSequence: 0,
      eligibleCount: 0,
      winnerCount: 0,
      participantCount: 0,
      eligibilityVersion: 0,
      drawLock: null,
      wheelRotation: 0,
      soundEnabled: true,
      updatedAt: this.now(),
      lastSpin: null,
      spinEndsAt: 0,
    };
  }

  /** Creates the state document on first use; seeds demo data for the demo env. */
  async ensureState(env: RaffleEnv): Promise<StateDoc> {
    const existing = await this.store.get<StateDoc>(paths.state(env));
    if (existing) return existing;
    const created = await this.store.runTransaction(async (tx) => {
      const s = await tx.get<StateDoc>(paths.state(env));
      if (s) return false;
      tx.create(paths.state(env), asDoc(this.initialState(env)));
      return true;
    });
    if (created && env === "demo") await this.seedDemo(SYSTEM_ACTOR);
    if (created && env === "production" && this.seedDefaultPrizes) await this.seedProductionPrizes(SYSTEM_ACTOR);
    if (created) await this.refreshPublic(env);
    return (await this.store.get<StateDoc>(paths.state(env)))!;
  }

  async getState(env: RaffleEnv): Promise<StateDoc> {
    return this.ensureState(env);
  }

  async getPublicDisplay(env: RaffleEnv): Promise<PublicDisplayState> {
    await this.ensureState(env);
    const pub = await this.store.get<PublicDisplayState & DocData>(paths.publicDisplay(env));
    return pub ?? (await this.refreshPublic(env));
  }

  private audit(tx: Transaction, env: RaffleEnv, actor: Actor, eventType: string, entityId: string | null, details: Record<string, unknown> = {}) {
    const log: AuditLog = { eventId: newId("evt"), eventType, organizerId: actor.email, entityId, timestamp: this.now(), details };
    tx.create(paths.auditLog(env, log.eventId), asDoc(log));
  }

  /** Records an audit event that isn't part of another write (e.g. data exports). */
  async recordAudit(env: RaffleEnv, actor: Actor, eventType: string, entityId: string | null, details: Record<string, unknown> = {}) {
    await this.store.runTransaction(async (tx) => this.audit(tx, env, actor, eventType, entityId, details));
  }

  // ------------------------------------------------------------------ locks

  /**
   * Draws and imports are serialized through a single lock on the state
   * document. Other eligibility changes bump eligibilityVersion, which the
   * draw commit validates against its pool snapshot.
   */
  private async acquireLock(env: RaffleEnv, actor: Actor, purpose: string, idempotencyKey: string, ttl: number): Promise<DrawLock> {
    const lock: DrawLock = { lockId: newId("lock"), holder: `${purpose}:${actor.email}`, idempotencyKey, expiresAt: this.now() + ttl };
    await this.store.runTransaction(async (tx) => {
      const state = await tx.get<StateDoc>(paths.state(env));
      if (!state) throw new RaffleError("NOT_FOUND", "Raffle state not initialized");
      if (state.drawLock && state.drawLock.expiresAt > this.now()) {
        throw new RaffleError("DRAW_IN_PROGRESS", "Another draw or import is in progress. Try again in a moment.");
      }
      tx.update(paths.state(env), { drawLock: lock, updatedAt: this.now() });
    });
    return lock;
  }

  private async releaseLock(env: RaffleEnv, lockId: string) {
    await this.store.runTransaction(async (tx) => {
      const state = await tx.get<StateDoc>(paths.state(env));
      if (state?.drawLock?.lockId === lockId) tx.update(paths.state(env), { drawLock: null });
    });
  }

  // ------------------------------------------------------------------ public projection

  /** Rebuilds the projector-safe document. Contains no emails or private fields. */
  async refreshPublic(env: RaffleEnv): Promise<PublicDisplayState> {
    const [prizes, eligibleCount, winnerCount, participantCount] = await Promise.all([
      this.listPrizes(env),
      this.store.count(paths.participants(env), [["eligibilityStatus", "==", "eligible"]]),
      this.store.count(paths.participants(env), [["eligibilityStatus", "==", "winner"]]),
      this.store.count(paths.participants(env), [["eligibilityStatus", "in", ["eligible", "ineligible", "winner"]]]),
    ]);
    return this.store.runTransaction(async (tx) => {
      const state = await tx.get<StateDoc>(paths.state(env));
      if (!state) throw new RaffleError("NOT_FOUND", "Raffle state not initialized");
      const draw = state.activeDrawId ? await tx.get<Draw & DocData>(paths.draw(env, state.activeDrawId)) : null;
      const current = prizes.find((p) => p.prizeId === state.currentPrizeId) ?? null;
      const prizesRemaining = prizes.reduce((n, p) => n + p.remainingQuantity, 0);
      const allAwarded = prizes.length > 0 && prizesRemaining === 0;
      const pub: PublicDisplayState = {
        env,
        isDemo: env === "demo",
        raffleStatus: state.status === "paused" ? "paused" : allAwarded ? "completed" : "ready",
        currentPrize: current
          ? {
              prizeId: current.prizeId,
              name: current.name,
              description: current.description,
              imageUrl: current.imageUrl,
              quantity: current.quantity,
              remainingQuantity: current.remainingQuantity,
            }
          : null,
        eligibleCount,
        winnerCount,
        prizesRemaining,
        spin: state.lastSpin,
        reveal: draw
          ? {
              drawId: draw.drawId,
              drawNumber: draw.drawNumber,
              winnerName: draw.winnerNameSnapshot,
              disambiguator: draw.displayDisambiguator,
              prizeName: draw.prizeNameSnapshot,
              voided: draw.status === "voided",
            }
          : null,
        wheelRotation: state.wheelRotation,
        soundEnabled: state.soundEnabled,
        updatedAt: this.now(),
      };
      tx.update(paths.state(env), { eligibleCount, winnerCount, participantCount, updatedAt: this.now() });
      tx.set(paths.publicDisplay(env), asDoc(pub));
      return pub;
    });
  }

  private async readState(tx: Transaction, env: RaffleEnv) {
    const state = await tx.get<StateDoc>(paths.state(env));
    if (!state) throw new RaffleError("NOT_FOUND", "Raffle state not initialized");
    return state;
  }

  // ------------------------------------------------------------------ participants

  async listParticipants(env: RaffleEnv): Promise<Participant[]> {
    await this.ensureState(env);
    return this.store.query<Participant & DocData>(paths.participants(env), { orderBy: { field: "createdAt" } });
  }

  private assertUnique(all: Participant[], input: Partial<ParticipantInput>, selfId: string | null) {
    for (const field of ["attendeeId", "email", "ticketNumber"] as const) {
      const v = input[field];
      if (!v) continue;
      const k = keyOf[field](v);
      const clash = all.find((p) => p.participantId !== selfId && p[field] && keyOf[field](p[field]!) === k);
      if (clash) throw new RaffleError("CONFLICT", `Another participant already has this ${field === "attendeeId" ? "attendee ID" : field === "ticketNumber" ? "ticket number" : "email"}.`);
    }
  }

  async addParticipant(env: RaffleEnv, actor: Actor, raw: unknown): Promise<Participant> {
    const input = participantInputSchema.parse(raw);
    const all = await this.listParticipants(env);
    if (all.length >= MAX_PARTICIPANTS) throw new RaffleError("VALIDATION", `Participant limit (${MAX_PARTICIPANTS}) reached`);
    this.assertUnique(all, input, null);
    const now = this.now();
    const p: Participant = {
      participantId: newId("p"),
      ...input,
      eligibilityStatus: "eligible",
      ineligibleReason: null,
      hasWon: false,
      prizeId: null,
      prizeName: null,
      drawId: null,
      importId: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.runTransaction(async (tx) => {
      const state = await this.readState(tx, env);
      tx.create(paths.participant(env, p.participantId), asDoc(p));
      tx.update(paths.state(env), { eligibilityVersion: state.eligibilityVersion + 1, updatedAt: now });
      this.audit(tx, env, actor, "participant.created", p.participantId, { name: p.name });
    });
    await this.refreshPublic(env);
    return p;
  }

  async updateParticipant(env: RaffleEnv, actor: Actor, participantId: string, raw: unknown): Promise<Participant> {
    const patch = participantUpdateSchema.parse(raw);
    const all = await this.listParticipants(env);
    const current = all.find((p) => p.participantId === participantId);
    // Only check uniqueness for identifiers that actually change, so records
    // imported with an organizer-approved shared value stay editable.
    const changedIds: Partial<ParticipantInput> = {};
    for (const f of ["attendeeId", "email", "ticketNumber"] as const) {
      if (patch[f] !== undefined && patch[f] !== current?.[f]) changedIds[f] = patch[f];
    }
    this.assertUnique(all, changedIds, participantId);
    const now = this.now();
    const updated = await this.store.runTransaction(async (tx) => {
      const state = await this.readState(tx, env);
      const p = await tx.get<Participant & DocData>(paths.participant(env, participantId));
      if (!p) throw new RaffleError("NOT_FOUND", "Participant not found");
      if (patch.eligibilityStatus && p.eligibilityStatus === "winner") {
        throw new RaffleError("INVALID_TRANSITION", "This participant is a selected winner. Void their draw first to change eligibility.");
      }
      const changes: Partial<Participant> = { ...patch, updatedAt: now };
      if (patch.eligibilityStatus) changes.ineligibleReason = patch.eligibilityStatus === "ineligible" ? "manual" : null;
      const next = { ...p, ...changes } as Participant;
      tx.update(paths.participant(env, participantId), asDoc(changes));
      tx.update(paths.state(env), { eligibilityVersion: state.eligibilityVersion + 1, updatedAt: now });
      this.audit(tx, env, actor, patch.eligibilityStatus === "removed" ? "participant.removed" : "participant.updated", participantId, {
        changes: patch,
        previousStatus: p.eligibilityStatus,
      });
      return next;
    });
    await this.refreshPublic(env);
    return updated;
  }

  async bulkSetEligibility(env: RaffleEnv, actor: Actor, ids: string[], status: "eligible" | "ineligible"): Promise<{ updated: number; skipped: number }> {
    if (ids.length === 0) return { updated: 0, skipped: 0 };
    if (ids.length > MAX_PARTICIPANTS) throw new RaffleError("VALIDATION", "Too many participants selected");
    const now = this.now();
    // Chunk to keep each transaction bounded.
    let updated = 0;
    let skipped = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const r = await this.store.runTransaction(async (tx) => {
        const state = await this.readState(tx, env);
        const docs = await tx.getAll<Participant & DocData>(chunk.map((id) => paths.participant(env, id)));
        let u = 0;
        let s = 0;
        docs.forEach((p) => {
          if (!p || p.eligibilityStatus === "winner" || p.eligibilityStatus === "removed" || p.eligibilityStatus === status) {
            s++;
            return;
          }
          u++;
          tx.update(paths.participant(env, p.participantId), {
            eligibilityStatus: status,
            ineligibleReason: status === "ineligible" ? "manual" : null,
            updatedAt: now,
          });
        });
        tx.update(paths.state(env), { eligibilityVersion: state.eligibilityVersion + 1, updatedAt: now });
        this.audit(tx, env, actor, "participant.bulk_eligibility", null, { status, updated: u, skipped: s, ids: chunk });
        return { u, s };
      });
      updated += r.u;
      skipped += r.s;
    }
    await this.refreshPublic(env);
    return { updated, skipped };
  }

  /**
   * Imports participants. The server re-validates and re-deduplicates every
   * row — client-side review is a convenience, never trusted. Imports are
   * idempotent: the fingerprint of the rows is the import ID, participant IDs
   * are derived from it, and a completed import cannot be repeated.
   */
  async importParticipants(
    env: RaffleEnv,
    actor: Actor,
    input: { rows: unknown[]; fileName?: string | null; overrideDuplicates?: number[] },
  ): Promise<{ importId: string; imported: number; skipped: { index: number; reasons: string[] }[]; resumed: boolean }> {
    await this.ensureState(env);
    if (!Array.isArray(input.rows) || input.rows.length === 0) throw new RaffleError("VALIDATION", "No rows to import");
    if (input.rows.length > MAX_IMPORT_ROWS) throw new RaffleError("VALIDATION", `At most ${MAX_IMPORT_ROWS} rows per import`);

    const values = input.rows.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const v = {} as Record<ImportField, string>;
      for (const f of ["attendeeId", "name", "email", "ticketNumber", "company"] as const) v[f] = typeof o[f] === "string" ? (o[f] as string) : "";
      return v;
    });
    const firstPass = reviewRows(values);
    const parsedRows = firstPass.filter((r) => r.data).map((r) => r.data!);
    if (parsedRows.length === 0) throw new RaffleError("VALIDATION", "None of the rows are valid. Every row needs a name.");
    const importId = `imp_${await importFingerprint(parsedRows)}`;
    const overrides = new Set((input.overrideDuplicates ?? []).filter((n) => Number.isInteger(n)));

    const lock = await this.acquireLock(env, actor, "import", importId, IMPORT_LOCK_TTL_MS);
    try {
      const prior = await this.store.get<ImportRecord & DocData>(paths.import(env, importId));
      if (prior?.status === "completed") {
        throw new RaffleError("DUPLICATE_IMPORT", `This exact file was already imported (${prior.importedCount} participants). Nothing was changed.`);
      }
      const resumed = prior?.status === "in_progress";
      const existing = (await this.listParticipants(env)).filter((p) => p.importId !== importId);
      const reviewed = reviewRows(values, existingKeysFrom(existing));
      // Valid rows are accepted unless they're duplicates; a duplicate is
      // accepted only when the organizer explicitly overrode it.
      const included = (r: (typeof reviewed)[number]) =>
        r.data !== null && (r.defaultInclude || (overrides.has(r.index) && r.issues.every((i) => i.kind !== "invalid")));
      const accepted = reviewed.filter(included);
      if (existing.length + accepted.length > MAX_PARTICIPANTS) {
        throw new RaffleError("VALIDATION", `Import would exceed the ${MAX_PARTICIPANTS} participant limit`);
      }
      const now = this.now();
      const record: ImportRecord = {
        importId,
        status: "in_progress",
        fileName: input.fileName ? String(input.fileName).slice(0, 200) : null,
        rowCount: values.length,
        importedCount: accepted.length,
        createdBy: actor.email,
        createdAt: prior?.createdAt ?? now,
        completedAt: null,
      };
      await this.store.runTransaction(async (tx) => tx.set(paths.import(env, importId), asDoc(record)));

      await this.store.bulkWrite(
        accepted.map((r) => {
          const p: Participant = {
            participantId: deterministicId("p", importId, String(r.index)),
            ...r.data!,
            eligibilityStatus: "eligible",
            ineligibleReason: null,
            hasWon: false,
            prizeId: null,
            prizeName: null,
            drawId: null,
            importId,
            createdAt: now + r.index / 1000,
            updatedAt: now,
          };
          return { type: "set" as const, path: paths.participant(env, p.participantId), data: asDoc(p) };
        }),
      );

      const skipped = reviewed
        .filter((r) => !included(r))
        .map((r) => ({ index: r.index, reasons: r.issues.map((i) => (i.kind === "invalid" ? i.message : i.kind)) }));
      await this.store.runTransaction(async (tx) => {
        const state = await this.readState(tx, env);
        tx.update(paths.import(env, importId), { status: "completed", completedAt: this.now() });
        tx.update(paths.state(env), { eligibilityVersion: state.eligibilityVersion + 1, updatedAt: this.now() });
        this.audit(tx, env, actor, "participants.imported", importId, {
          fileName: record.fileName,
          rows: values.length,
          imported: accepted.length,
          skipped: skipped.length,
          resumed,
        });
      });
      await this.refreshPublic(env);
      return { importId, imported: accepted.length, skipped, resumed };
    } finally {
      await this.releaseLock(env, lock.lockId);
    }
  }

  // ------------------------------------------------------------------ prizes

  async listPrizes(env: RaffleEnv): Promise<Prize[]> {
    return this.store.query<Prize & DocData>(paths.prizes(env), { orderBy: { field: "drawOrder" } });
  }

  async createPrize(env: RaffleEnv, actor: Actor, raw: unknown): Promise<Prize> {
    await this.ensureState(env);
    const input = prizeInputSchema.parse(raw);
    const prizes = await this.listPrizes(env);
    const now = this.now();
    const prize: Prize = {
      prizeId: newId("prz"),
      ...input,
      remainingQuantity: input.quantity,
      drawOrder: prizes.length ? Math.max(...prizes.map((p) => p.drawOrder)) + 1 : 1,
      status: "upcoming",
      drawCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.store.runTransaction(async (tx) => {
      const state = await this.readState(tx, env);
      tx.create(paths.prize(env, prize.prizeId), asDoc(prize));
      if (!state.currentPrizeId) tx.update(paths.state(env), { currentPrizeId: prize.prizeId, updatedAt: now });
      this.audit(tx, env, actor, "prize.created", prize.prizeId, { name: prize.name, quantity: prize.quantity });
    });
    await this.refreshPublic(env);
    return prize;
  }

  async updatePrize(env: RaffleEnv, actor: Actor, prizeId: string, raw: unknown): Promise<Prize> {
    const r = (raw ?? {}) as Record<string, unknown>;
    const patch = prizeInputSchema.partial().parse(r);
    const status = r.status === undefined ? undefined : (r.status as PrizeStatus);
    if (status !== undefined && !["upcoming", "in_progress", "awarded", "claimed"].includes(status)) {
      throw new RaffleError("VALIDATION", "Invalid prize status");
    }
    const now = this.now();
    const updated = await this.store.runTransaction(async (tx) => {
      const p = await tx.get<Prize & DocData>(paths.prize(env, prizeId));
      if (!p) throw new RaffleError("NOT_FOUND", "Prize not found");
      const awarded = p.quantity - p.remainingQuantity;
      const changes: Partial<Prize> = { ...patch, updatedAt: now };
      if (patch.quantity !== undefined) {
        if (patch.quantity < awarded) throw new RaffleError("VALIDATION", `Quantity can't be below the ${awarded} already drawn`);
        changes.remainingQuantity = patch.quantity - awarded;
        if (changes.remainingQuantity > 0 && (p.status === "awarded" || p.status === "claimed")) changes.status = "in_progress";
      }
      if (status) changes.status = status;
      tx.update(paths.prize(env, prizeId), asDoc(changes));
      this.audit(tx, env, actor, "prize.updated", prizeId, { changes: { ...patch, status } });
      return { ...p, ...changes } as Prize;
    });
    await this.refreshPublic(env);
    return updated;
  }

  async deletePrize(env: RaffleEnv, actor: Actor, prizeId: string): Promise<void> {
    await this.store.runTransaction(async (tx) => {
      const state = await this.readState(tx, env);
      const p = await tx.get<Prize & DocData>(paths.prize(env, prizeId));
      if (!p) throw new RaffleError("NOT_FOUND", "Prize not found");
      if (p.drawCount > 0) throw new RaffleError("NOT_ALLOWED", "This prize has draw history and can't be deleted.");
      tx.delete(paths.prize(env, prizeId));
      if (state.currentPrizeId === prizeId) tx.update(paths.state(env), { currentPrizeId: null });
      this.audit(tx, env, actor, "prize.deleted", prizeId, { name: p.name });
    });
    await this.refreshPublic(env);
  }

  async reorderPrizes(env: RaffleEnv, actor: Actor, orderedIds: string[]): Promise<void> {
    const prizes = await this.listPrizes(env);
    const known = new Set(prizes.map((p) => p.prizeId));
    if (orderedIds.length !== prizes.length || !orderedIds.every((id) => known.has(id)) || new Set(orderedIds).size !== orderedIds.length) {
      throw new RaffleError("VALIDATION", "Reorder must include every prize exactly once");
    }
    await this.store.runTransaction(async (tx) => {
      await tx.getAll(orderedIds.map((id) => paths.prize(env, id)));
      orderedIds.forEach((id, i) => tx.update(paths.prize(env, id), { drawOrder: i + 1, updatedAt: this.now() }));
      this.audit(tx, env, actor, "prize.reordered", null, { order: orderedIds });
    });
    await this.refreshPublic(env);
  }

  // ------------------------------------------------------------------ draws

  async listDraws(env: RaffleEnv): Promise<Draw[]> {
    await this.ensureState(env);
    return this.store.query<Draw & DocData>(paths.draws(env), { orderBy: { field: "drawNumber" } });
  }

  async getDraw(env: RaffleEnv, drawId: string): Promise<Draw | null> {
    return this.store.get<Draw & DocData>(paths.draw(env, drawId));
  }

  /**
   * Performs a fair, server-side draw.
   *
   * 1. Replays the stored result if this idempotency key was already used.
   * 2. Acquires the draw lock (one draw or import at a time per environment).
   * 3. Snapshots the complete eligible pool and its eligibilityVersion.
   * 4. Picks uniformly with crypto.randomInt.
   * 5. Commits in a transaction that re-validates the version, the lock, the
   *    winner's eligibility, and the prize quantity. If anything changed, the
   *    pool is re-read and the selection repeated (nothing is consumed).
   */
  async draw(env: RaffleEnv, actor: Actor, input: { prizeId: string; idempotencyKey: string }): Promise<{ draw: Draw; replayed: boolean }> {
    await this.ensureState(env);
    const { prizeId, idempotencyKey } = input;

    const replay = await this.replayDraw(env, idempotencyKey);
    if (replay) return { draw: replay, replayed: true };

    await this.store.runTransaction(async (tx) => {
      const [state, prize] = await tx.getAll<DocData>([paths.state(env), paths.prize(env, prizeId)]);
      this.assertCanDraw(state as unknown as StateDoc, prize as unknown as Prize | null);
    });

    const lock = await this.acquireLock(env, actor, "draw", idempotencyKey, DRAW_LOCK_TTL_MS);
    try {
      for (let attempt = 0; attempt < MAX_POOL_RETRIES; attempt++) {
        const snapshotState = (await this.store.get<StateDoc>(paths.state(env)))!;
        const version = snapshotState.eligibilityVersion;
        const pool = await this.store.query<Participant & DocData>(paths.participants(env), {
          filters: [["eligibilityStatus", "==", "eligible"]],
        });
        if (pool.length === 0) throw new RaffleError("NO_ELIGIBLE_PARTICIPANTS", "There are no eligible participants left.");
        const winner = selectUniform(pool, (p) => p.participantId, this.rng);
        const sameName = await this.store.query<Participant & DocData>(paths.participants(env), { filters: [["name", "==", winner.name]], limit: 2 });
        // Ticket number is shown when available; for shared names without one,
        // fall back to attendee ID or a short entry code so the room can tell them apart.
        const disambiguator = winner.ticketNumber
          ? `Ticket ${winner.ticketNumber}`
          : sameName.length > 1
            ? winner.attendeeId
              ? `ID ${winner.attendeeId}`
              : `Entry ${winner.participantId.slice(-4).toUpperCase()}`
            : null;

        await this.beforeCommit?.();
        try {
          const draw = await this.store.runTransaction(async (tx) => {
            const [stateRaw, prizeRaw, participantRaw, idemRaw] = await tx.getAll<DocData>([
              paths.state(env),
              paths.prize(env, prizeId),
              paths.participant(env, winner.participantId),
              paths.idempotency(env, idempotencyKey),
            ]);
            const state = stateRaw as unknown as StateDoc;
            const prize = prizeRaw as unknown as Prize | null;
            const participant = participantRaw as unknown as Participant | null;
            if (idemRaw) throw new RaffleError("CONFLICT", "Idempotency key already used");
            if (state.drawLock?.lockId !== lock.lockId) throw new RaffleError("CONFLICT", "Draw lock expired. Please try again.");
            this.assertCanDraw(state, prize, { ignoreLock: true });
            if (state.eligibilityVersion !== version || participant?.eligibilityStatus !== "eligible") throw new StalePoolError();

            const now = this.now();
            const drawId = newId("draw");
            const drawNumber = state.drawSequence + 1;
            const { targetSegment, toRotation } = planSpin(drawId, state.wheelRotation);
            const spin: PublicSpin = {
              spinId: drawId,
              drawNumber,
              startedAt: now,
              durationMs: this.spinDurationMs,
              fromRotation: state.wheelRotation,
              toRotation,
              targetSegment,
            };
            const draw: Draw = {
              drawId,
              drawNumber,
              prizeId,
              prizeNameSnapshot: prize!.name,
              participantId: winner.participantId,
              winnerNameSnapshot: participant.name,
              ticketNumberSnapshot: participant.ticketNumber,
              displayDisambiguator: disambiguator,
              eligiblePoolSize: pool.length,
              eligibilityVersion: version,
              status: "selected",
              statusHistory: [{ status: "selected", at: now, by: actor.email, reason: null }],
              initiatedBy: actor.email,
              createdAt: now,
              announcedAt: null,
              confirmedAt: null,
              claimedAt: null,
              absentAt: null,
              voidedAt: null,
              voidReason: null,
              idempotencyKey,
            };
            const remaining = prize!.remainingQuantity - 1;
            tx.create(paths.draw(env, drawId), asDoc(draw));
            tx.create(paths.idempotency(env, idempotencyKey), { drawId, createdAt: now, by: actor.email });
            tx.update(paths.participant(env, participant.participantId), {
              eligibilityStatus: "winner",
              hasWon: true,
              prizeId,
              prizeName: prize!.name,
              drawId,
              ineligibleReason: null,
              updatedAt: now,
            });
            tx.update(paths.prize(env, prizeId), {
              remainingQuantity: remaining,
              drawCount: prize!.drawCount + 1,
              status: remaining === 0 ? "awarded" : "in_progress",
              updatedAt: now,
            });
            tx.update(paths.state(env), {
              drawSequence: drawNumber,
              activeDrawId: drawId,
              currentPrizeId: prizeId,
              eligibilityVersion: state.eligibilityVersion + 1,
              eligibleCount: pool.length - 1,
              winnerCount: state.winnerCount + 1,
              drawLock: null,
              wheelRotation: toRotation,
              lastSpin: asDoc(spin),
              spinEndsAt: now + this.spinDurationMs,
              updatedAt: now,
            });
            this.audit(tx, env, actor, "draw.created", drawId, {
              drawNumber,
              prizeId,
              participantId: participant.participantId,
              eligiblePoolSize: pool.length,
              eligibilityVersion: version,
              idempotencyKey,
            });
            return draw;
          });
          await this.refreshPublic(env);
          return { draw, replayed: false };
        } catch (e) {
          if (e instanceof StalePoolError) continue;
          throw e;
        }
      }
      throw new RaffleError("STALE_POOL", "Participants changed while drawing. No winner was recorded — please spin again.");
    } catch (e) {
      // A concurrent retry of the same request may have committed: replay it.
      const replayAfter = await this.replayDraw(env, idempotencyKey);
      if (replayAfter) return { draw: replayAfter, replayed: true };
      throw e;
    } finally {
      await this.releaseLock(env, lock.lockId);
    }
  }

  private async replayDraw(env: RaffleEnv, idempotencyKey: string): Promise<Draw | null> {
    const idem = await this.store.get<{ drawId: string }>(paths.idempotency(env, idempotencyKey));
    return idem ? this.getDraw(env, idem.drawId) : null;
  }

  private assertCanDraw(state: StateDoc | null, prize: Prize | null, opts: { ignoreLock?: boolean } = {}) {
    if (!state) throw new RaffleError("NOT_FOUND", "Raffle state not initialized");
    if (state.status === "paused") throw new RaffleError("RAFFLE_PAUSED", "The raffle is paused. Resume it to spin.");
    if (!prize) throw new RaffleError("NOT_FOUND", "Prize not found");
    if (!isDrawable(prize)) {
      throw new RaffleError("PRIZE_EXHAUSTED", `All ${prize.quantity} of "${prize.name}" have been drawn.`);
    }
    if (state.spinEndsAt > this.now()) throw new RaffleError("DRAW_IN_PROGRESS", "The wheel is still spinning.");
    if (!opts.ignoreLock && state.drawLock && state.drawLock.expiresAt > this.now()) {
      throw new RaffleError("DRAW_IN_PROGRESS", "A draw is already in progress.");
    }
  }

  /** Moves a draw through Selected → Announced → Confirmed → Claimed, or Absent / Voided. */
  async updateDrawStatus(env: RaffleEnv, actor: Actor, drawId: string, action: DrawAction, reason?: string | null): Promise<Draw> {
    const target = ACTION_STATUS[action];
    if (!target) throw new RaffleError("VALIDATION", "Unknown action");
    const cleanReason = reason?.toString().trim().slice(0, 500) || null;
    if (action === "void" && (!cleanReason || cleanReason.length < 3)) throw new RaffleError("VALIDATION", "A reason is required to void a draw.");

    const result = await this.store.runTransaction(async (tx) => {
      const draw = await tx.get<Draw & DocData>(paths.draw(env, drawId));
      if (!draw) throw new RaffleError("NOT_FOUND", "Draw not found");
      if (draw.status === target) return { draw: draw as Draw, changed: false };
      if (!TRANSITIONS[draw.status].includes(target)) {
        throw new RaffleError("INVALID_TRANSITION", `Can't change a ${draw.status} draw to ${target}.`);
      }
      const [state, prize, participant] = await tx.getAll<DocData>([
        paths.state(env),
        paths.prize(env, draw.prizeId),
        paths.participant(env, draw.participantId),
      ]);
      const now = this.now();
      const change = { status: target, at: now, by: actor.email, reason: cleanReason };
      const updates: Partial<Draw> = { status: target, statusHistory: [...draw.statusHistory, change] };
      if (target === "announced") updates.announcedAt = now;
      if (target === "confirmed") updates.confirmedAt = now;
      if (target === "claimed") updates.claimedAt = now;
      if (target === "absent") updates.absentAt = now;
      if (target === "voided") {
        updates.voidedAt = now;
        updates.voidReason = cleanReason;
        const pz = prize as unknown as Prize | null;
        if (pz) {
          tx.update(paths.prize(env, pz.prizeId), {
            remainingQuantity: pz.remainingQuantity + 1,
            status: "in_progress",
            updatedAt: now,
          });
        }
        if (participant) {
          // Voided winners stay excluded until an organizer explicitly restores them.
          tx.update(paths.participant(env, draw.participantId), {
            eligibilityStatus: "ineligible",
            ineligibleReason: "voided-draw",
            hasWon: false,
            prizeId: null,
            prizeName: null,
            updatedAt: now,
          });
        }
        const st = state as unknown as StateDoc;
        tx.update(paths.state(env), { eligibilityVersion: st.eligibilityVersion + 1, updatedAt: now });
      }
      tx.update(paths.draw(env, drawId), asDoc(updates));
      this.audit(tx, env, actor, `draw.${target}`, drawId, { from: draw.status, to: target, reason: cleanReason, participantId: draw.participantId });
      return { draw: { ...draw, ...updates } as Draw, changed: true };
    });

    if (result.changed && target === "claimed") await this.maybeMarkPrizeClaimed(env, result.draw.prizeId);
    if (result.changed) await this.refreshPublic(env);
    return result.draw;
  }

  private async maybeMarkPrizeClaimed(env: RaffleEnv, prizeId: string) {
    const draws = (await this.listDraws(env)).filter((d) => d.prizeId === prizeId && d.status !== "voided");
    await this.store.runTransaction(async (tx) => {
      const prize = await tx.get<Prize & DocData>(paths.prize(env, prizeId));
      if (prize && prize.remainingQuantity === 0 && draws.length > 0 && draws.every((d) => d.status === "claimed")) {
        tx.update(paths.prize(env, prizeId), { status: "claimed", updatedAt: this.now() });
      }
    });
  }

  // ------------------------------------------------------------------ raffle controls

  async setCurrentPrize(env: RaffleEnv, actor: Actor, prizeId: string | null): Promise<void> {
    await this.store.runTransaction(async (tx) => {
      const state = await this.readState(tx, env);
      if (prizeId) {
        const p = await tx.get(paths.prize(env, prizeId));
        if (!p) throw new RaffleError("NOT_FOUND", "Prize not found");
      }
      if (state.currentPrizeId === prizeId) return;
      tx.update(paths.state(env), { currentPrizeId: prizeId, activeDrawId: null, updatedAt: this.now() });
      this.audit(tx, env, actor, "raffle.prize_selected", prizeId, {});
    });
    await this.refreshPublic(env);
  }

  /** Advances to the next prize (by draw order) that still has quantity left. */
  async nextPrize(env: RaffleEnv, actor: Actor): Promise<Prize | null> {
    const state = await this.getState(env);
    const prizes = await this.listPrizes(env);
    const available = prizes.filter(isDrawable);
    const currentOrder = prizes.find((p) => p.prizeId === state.currentPrizeId)?.drawOrder ?? -Infinity;
    const next = available.find((p) => p.drawOrder > currentOrder) ?? available[0] ?? null;
    await this.setCurrentPrize(env, actor, next?.prizeId ?? state.currentPrizeId);
    return next;
  }

  /** Returns the projector to the wheel without changing any draw. */
  async clearReveal(env: RaffleEnv, actor: Actor): Promise<void> {
    await this.store.runTransaction(async (tx) => {
      await this.readState(tx, env);
      tx.update(paths.state(env), { activeDrawId: null, updatedAt: this.now() });
      this.audit(tx, env, actor, "raffle.reveal_cleared", null, {});
    });
    await this.refreshPublic(env);
  }

  async setPaused(env: RaffleEnv, actor: Actor, paused: boolean): Promise<void> {
    await this.store.runTransaction(async (tx) => {
      await this.readState(tx, env);
      tx.update(paths.state(env), { status: paused ? "paused" : "ready", updatedAt: this.now() });
      this.audit(tx, env, actor, paused ? "raffle.paused" : "raffle.resumed", null, {});
    });
    await this.refreshPublic(env);
  }

  async setSound(env: RaffleEnv, actor: Actor, enabled: boolean): Promise<void> {
    await this.store.runTransaction(async (tx) => {
      await this.readState(tx, env);
      tx.update(paths.state(env), { soundEnabled: enabled, updatedAt: this.now() });
      this.audit(tx, env, actor, "raffle.sound", null, { enabled });
    });
    await this.refreshPublic(env);
  }

  async listAudit(env: RaffleEnv, limit = 500): Promise<AuditLog[]> {
    return this.store.query<AuditLog & DocData>(paths.auditLogs(env), { orderBy: { field: "timestamp", direction: "desc" }, limit });
  }

  // ------------------------------------------------------------------ demo

  private defaultPrizes(env: RaffleEnv, now: number): Prize[] {
    return DEFAULT_PRIZES.map((sp, i) => ({
      prizeId: deterministicId("prz", env, String(i)),
      ...sp,
      remainingQuantity: sp.quantity,
      drawOrder: i + 1,
      status: "upcoming",
      drawCount: 0,
      createdAt: now,
      updatedAt: now,
    }));
  }

  /** Pre-creates the default prize rounds in production on first setup only. */
  private async seedProductionPrizes(actor: Actor) {
    const env: RaffleEnv = "production";
    const prizes = this.defaultPrizes(env, this.now());
    await this.store.bulkWrite(prizes.map((p) => ({ type: "set" as const, path: paths.prize(env, p.prizeId), data: asDoc(p) })));
    await this.store.runTransaction(async (tx) => {
      await this.readState(tx, env);
      tx.update(paths.state(env), { currentPrizeId: prizes[0].prizeId, updatedAt: this.now() });
      this.audit(tx, env, actor, "prizes.defaults_created", null, { prizes: prizes.map((p) => p.name) });
    });
  }

  private async seedDemo(actor: Actor) {
    const env: RaffleEnv = "demo";
    const now = this.now();
    const attendees = generateDemoAttendees(300);
    const participantOps = attendees.map((a, i) => {
      const p: Participant = {
        participantId: deterministicId("p", "demo-seed", String(i)),
        ...a,
        eligibilityStatus: "eligible",
        ineligibleReason: null,
        hasWon: false,
        prizeId: null,
        prizeName: null,
        drawId: null,
        importId: "demo-seed",
        createdAt: now + i / 1000,
        updatedAt: now,
      };
      return { type: "set" as const, path: paths.participant(env, p.participantId), data: asDoc(p) };
    });
    const prizes = this.defaultPrizes(env, now);
    await this.store.bulkWrite([...participantOps, ...prizes.map((p) => ({ type: "set" as const, path: paths.prize(env, p.prizeId), data: asDoc(p) }))]);
    await this.store.runTransaction(async (tx) => {
      const state = await this.readState(tx, env);
      tx.update(paths.state(env), {
        currentPrizeId: prizes[0].prizeId,
        eligibilityVersion: state.eligibilityVersion + 1,
        updatedAt: this.now(),
      });
      this.audit(tx, env, actor, "demo.seeded", null, { participants: attendees.length, prizes: prizes.length });
    });
  }

  /**
   * Resets demo data only. Production can never be reset through this path.
   * Demo audit logs are kept so practice sessions remain traceable.
   */
  async resetDemo(env: RaffleEnv, actor: Actor, confirmation: string): Promise<void> {
    if (env !== "demo") throw new RaffleError("NOT_ALLOWED", "Only demo mode can be reset.");
    if (confirmation !== DEMO_RESET_PHRASE) throw new RaffleError("VALIDATION", `Type "${DEMO_RESET_PHRASE}" to confirm.`);
    await this.ensureState(env);
    const lock = await this.acquireLock(env, actor, "demo-reset", "demo-reset", IMPORT_LOCK_TTL_MS);
    try {
      for (const c of [paths.participants(env), paths.prizes(env), paths.draws(env), paths.imports(env), paths.idempotencyKeys(env)]) {
        await this.store.deleteCollection(c);
      }
      await this.store.runTransaction(async (tx) => {
        const state = await this.readState(tx, env);
        tx.set(paths.state(env), asDoc({ ...this.initialState(env), drawLock: state.drawLock, eligibilityVersion: state.eligibilityVersion + 1 }));
        this.audit(tx, env, actor, "demo.reset", null, {});
      });
      await this.seedDemo(actor);
    } finally {
      await this.releaseLock(env, lock.lockId);
    }
    await this.refreshPublic(env);
  }
}
