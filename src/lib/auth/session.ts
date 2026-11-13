import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Actor } from "../raffle/service";

export const SESSION_COOKIE = "__session"; // the only cookie name Firebase Hosting/CDNs forward
export const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours: one event day

export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  claims: Record<string, unknown>;
}

export function organizerAllowlist(raw = process.env.ORGANIZER_EMAILS ?? ""): Set<string> {
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * An identity is an organizer when its email is verified and either listed in
 * ORGANIZER_EMAILS or carries the custom claim `organizer: true`.
 */
export function isOrganizer(identity: VerifiedIdentity, allowlist = organizerAllowlist()): boolean {
  if (!identity.email || !identity.emailVerified) return false;
  if (identity.claims.organizer === true) return true;
  return allowlist.has(identity.email.toLowerCase());
}

export function toActor(identity: VerifiedIdentity): Actor {
  return { uid: identity.uid, email: identity.email!.toLowerCase() };
}

// ---------------------------------------------------------------- dev auth

/**
 * Dev login exists only for local demos and automated tests. It can never be
 * enabled in a production build (NODE_ENV=production).
 */
export function isDevAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_MODE === "dev" && env.NODE_ENV !== "production";
}

const g = globalThis as unknown as { __devSessionSecret?: string };
function devSecret(): string {
  if (process.env.DEV_SESSION_SECRET) return process.env.DEV_SESSION_SECRET;
  g.__devSessionSecret ??= randomBytes(32).toString("hex");
  return g.__devSessionSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", devSecret()).update(payload).digest("base64url");
}

export function createDevSession(email: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ email: email.toLowerCase(), exp: now + SESSION_MAX_AGE_MS })).toString("base64url");
  return `dev.${payload}.${sign(payload)}`;
}

export function verifyDevSession(token: string, now = Date.now()): VerifiedIdentity | null {
  if (!isDevAuthEnabled()) return null;
  const [prefix, payload, sig] = token.split(".");
  if (prefix !== "dev" || !payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email: string; exp: number };
    if (typeof exp !== "number" || exp < now) return null;
    return { uid: `dev:${email}`, email, emailVerified: true, claims: {} };
  } catch {
    return null;
  }
}
