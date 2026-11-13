import { z } from "zod";

/**
 * Raffle environments are fully isolated namespaces in the data store.
 * Demo data lives under envs/demo/**, production under envs/production/**.
 */
export const RAFFLE_ENVS = ["production", "demo"] as const;
export const raffleEnvSchema = z.enum(RAFFLE_ENVS);
export type RaffleEnv = z.infer<typeof raffleEnvSchema>;

export const ELIGIBILITY_STATUSES = ["eligible", "ineligible", "winner", "removed"] as const;
export const eligibilityStatusSchema = z.enum(ELIGIBILITY_STATUSES);
export type EligibilityStatus = z.infer<typeof eligibilityStatusSchema>;

export interface Participant {
  participantId: string;
  attendeeId: string | null;
  name: string;
  email: string | null;
  ticketNumber: string | null;
  company: string | null;
  eligibilityStatus: EligibilityStatus;
  /** Why a participant is ineligible (e.g. "voided-draw", "manual"). */
  ineligibleReason: string | null;
  hasWon: boolean;
  prizeId: string | null;
  prizeName: string | null;
  drawId: string | null;
  importId: string | null;
  createdAt: number;
  updatedAt: number;
}

export const PRIZE_STATUSES = ["upcoming", "in_progress", "awarded", "claimed"] as const;
export const prizeStatusSchema = z.enum(PRIZE_STATUSES);
export type PrizeStatus = z.infer<typeof prizeStatusSchema>;

export interface Prize {
  prizeId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  quantity: number;
  remainingQuantity: number;
  drawOrder: number;
  status: PrizeStatus;
  /** Total draws ever made for this prize (including voided). Never decremented. */
  drawCount: number;
  createdAt: number;
  updatedAt: number;
}

export const DRAW_STATUSES = ["selected", "announced", "confirmed", "claimed", "absent", "voided"] as const;
export const drawStatusSchema = z.enum(DRAW_STATUSES);
export type DrawStatus = z.infer<typeof drawStatusSchema>;

export interface DrawStatusChange {
  status: DrawStatus;
  at: number;
  by: string;
  reason: string | null;
}

export interface Draw {
  drawId: string;
  drawNumber: number;
  prizeId: string;
  prizeNameSnapshot: string;
  participantId: string;
  winnerNameSnapshot: string;
  ticketNumberSnapshot: string | null;
  /** Short label shown on the projector when names collide (ticket number or entry code). */
  displayDisambiguator: string | null;
  eligiblePoolSize: number;
  /** Eligibility version of the pool snapshot that was validated at commit time. */
  eligibilityVersion: number;
  status: DrawStatus;
  statusHistory: DrawStatusChange[];
  initiatedBy: string;
  createdAt: number;
  announcedAt: number | null;
  confirmedAt: number | null;
  claimedAt: number | null;
  absentAt: number | null;
  voidedAt: number | null;
  voidReason: string | null;
  idempotencyKey: string;
}

export const RAFFLE_STATUSES = ["ready", "paused", "completed"] as const;
export type RaffleStatus = (typeof RAFFLE_STATUSES)[number];

export interface DrawLock {
  lockId: string;
  holder: string;
  idempotencyKey: string;
  expiresAt: number;
}

export interface RaffleState {
  env: RaffleEnv;
  status: RaffleStatus;
  currentPrizeId: string | null;
  activeDrawId: string | null;
  drawSequence: number;
  eligibleCount: number;
  winnerCount: number;
  participantCount: number;
  /** Incremented on every change that can affect the eligible pool. */
  eligibilityVersion: number;
  drawLock: DrawLock | null;
  /** Wheel rotation (degrees) at rest after the most recent spin. */
  wheelRotation: number;
  soundEnabled: boolean;
  updatedAt: number;
}

/** Public, projector-safe state. Never contains emails or other private data. */
export interface PublicSpin {
  spinId: string;
  drawNumber: number;
  startedAt: number;
  durationMs: number;
  fromRotation: number;
  toRotation: number;
  targetSegment: number;
}

export interface PublicReveal {
  drawId: string;
  drawNumber: number;
  winnerName: string;
  disambiguator: string | null;
  prizeName: string;
  voided: boolean;
}

export interface PublicPrize {
  prizeId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  quantity: number;
  remainingQuantity: number;
}

export interface PublicDisplayState {
  env: RaffleEnv;
  isDemo: boolean;
  raffleStatus: RaffleStatus;
  currentPrize: PublicPrize | null;
  eligibleCount: number;
  winnerCount: number;
  prizesRemaining: number;
  spin: PublicSpin | null;
  reveal: PublicReveal | null;
  wheelRotation: number;
  soundEnabled: boolean;
  updatedAt: number;
}

export interface AuditLog {
  eventId: string;
  eventType: string;
  organizerId: string;
  entityId: string | null;
  timestamp: number;
  details: Record<string, unknown>;
}

export interface ImportRecord {
  importId: string;
  status: "in_progress" | "completed";
  fileName: string | null;
  rowCount: number;
  importedCount: number;
  createdBy: string;
  createdAt: number;
  completedAt: number | null;
}

// ---------- Request schemas (shared by API routes and the UI) ----------

const trimmed = (max: number) => z.string().trim().max(max);
const optionalField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const participantInputSchema = z.object({
  attendeeId: optionalField(64),
  name: trimmed(120).min(1, "Name is required"),
  email: optionalField(254).refine((v) => v === null || z.email().safeParse(v).success, "Invalid email"),
  ticketNumber: optionalField(64),
  company: optionalField(120),
});
export type ParticipantInput = z.infer<typeof participantInputSchema>;

export const participantUpdateSchema = participantInputSchema.partial().extend({
  eligibilityStatus: z.enum(["eligible", "ineligible", "removed"]).optional(),
});

export const prizeInputSchema = z.object({
  name: trimmed(120).min(1, "Prize name is required"),
  description: trimmed(500).default(""),
  imageUrl: optionalField(2048).refine(
    (v) => v === null || /^https:\/\//i.test(v) || /^\/[^/]/.test(v),
    "Image URL must be https:// or a site-relative path",
  ),
  quantity: z.coerce.number().int().min(1).max(500),
});
export type PrizeInput = z.infer<typeof prizeInputSchema>;

export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,128}$/, "Invalid idempotency key");
