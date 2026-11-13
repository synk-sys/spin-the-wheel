import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/handler";
import { RaffleError } from "@/lib/domain/errors";
import { isOrganizer, SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/auth/session";
import { setSessionCookie, clearSessionCookie, assertSameOriginRequest } from "@/lib/auth/cookies";

/**
 * Exchanges a fresh Firebase ID token (from Google sign-in) for an httpOnly
 * session cookie — only for verified, allowlisted organizers.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOriginRequest(req);
    const { idToken } = z.object({ idToken: z.string().min(20).max(4096) }).parse(await req.json());
    const { adminAuth } = await import("@/lib/firebase/admin");
    const decoded = await adminAuth().verifyIdToken(idToken, true).catch(() => null);
    if (!decoded) throw new RaffleError("UNAUTHENTICATED", "Sign-in could not be verified. Please try again.");
    // Require a recent sign-in so a stolen old ID token can't mint a session.
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) throw new RaffleError("UNAUTHENTICATED", "Please sign in again.");
    const identity = { uid: decoded.uid, email: decoded.email ?? null, emailVerified: decoded.email_verified === true, claims: decoded as unknown as Record<string, unknown> };
    if (!isOrganizer(identity)) {
      throw new RaffleError("FORBIDDEN", `${decoded.email ?? "This account"} is not on the organizer list. Ask the event lead to add you.`);
    }
    const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const res = NextResponse.json({ ok: true, email: identity.email });
    setSessionCookie(res, cookie);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    assertSameOriginRequest(req);
    const value = req.cookies.get(SESSION_COOKIE)?.value;
    if (value && !value.startsWith("dev.")) {
      // Revoke refresh tokens so the session cookie stops verifying everywhere.
      const { adminAuth } = await import("@/lib/firebase/admin");
      const decoded = await adminAuth().verifySessionCookie(value).catch(() => null);
      if (decoded) await adminAuth().revokeRefreshTokens(decoded.sub).catch(() => undefined);
    }
    const res = NextResponse.json({ ok: true });
    clearSessionCookie(res);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
