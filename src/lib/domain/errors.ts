export type RaffleErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "DRAW_IN_PROGRESS"
  | "NO_ELIGIBLE_PARTICIPANTS"
  | "PRIZE_EXHAUSTED"
  | "RAFFLE_PAUSED"
  | "STALE_POOL"
  | "DUPLICATE_IMPORT"
  | "INVALID_TRANSITION"
  | "NOT_ALLOWED";

const STATUS: Record<RaffleErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  DRAW_IN_PROGRESS: 409,
  NO_ELIGIBLE_PARTICIPANTS: 409,
  PRIZE_EXHAUSTED: 409,
  RAFFLE_PAUSED: 409,
  STALE_POOL: 409,
  DUPLICATE_IMPORT: 409,
  INVALID_TRANSITION: 409,
  NOT_ALLOWED: 403,
};

export class RaffleError extends Error {
  readonly code: RaffleErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: RaffleErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "RaffleError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isRaffleError(e: unknown): e is RaffleError {
  return e instanceof RaffleError;
}
