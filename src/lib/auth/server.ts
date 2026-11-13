import "server-only";
import { RaffleError } from "../domain/errors";
import type { Actor } from "../raffle/service";
import { isDevAuthEnabled, isOrganizer, SESSION_COOKIE, toActor, verifyDevSession, type VerifiedIdentity } from "./session";

/** Verifies a session cookie value (Firebase session cookie, or dev token locally). */
export async function verifySessionValue(value: string | undefined | null): Promise<VerifiedIdentity | null> {
  if (!value) return null;
  if (value.startsWith("dev.")) return isDevAuthEnabled() ? verifyDevSession(value) : null;
  try {
    const { adminAuth } = await import("../firebase/admin");
    // checkRevoked=true: signed-out / disabled organizers lose access immediately.
    const decoded = await adminAuth().verifySessionCookie(value, true);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      claims: decoded as unknown as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

export type AuthResult = { ok: true; actor: Actor } | { ok: false; status: 401 | 403 };

export async function authorizeCookie(value: string | undefined | null): Promise<AuthResult> {
  const identity = await verifySessionValue(value);
  if (!identity) return { ok: false, status: 401 };
  if (!isOrganizer(identity)) return { ok: false, status: 403 };
  return { ok: true, actor: toActor(identity) };
}

export async function requireOrganizerFromCookies(get: (name: string) => string | undefined): Promise<Actor> {
  const r = await authorizeCookie(get(SESSION_COOKIE));
  if (!r.ok) throw new RaffleError(r.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", r.status === 401 ? "Please sign in." : "This account is not an authorized organizer.");
  return r.actor;
}
