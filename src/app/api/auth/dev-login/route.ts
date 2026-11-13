import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/handler";
import { RaffleError } from "@/lib/domain/errors";
import { createDevSession, isDevAuthEnabled, isOrganizer } from "@/lib/auth/session";
import { assertSameOriginRequest, setSessionCookie } from "@/lib/auth/cookies";

/** Local-only login for demos and tests. Returns 404 unless AUTH_MODE=dev outside production. */
export async function POST(req: NextRequest) {
  if (!isDevAuthEnabled()) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  try {
    assertSameOriginRequest(req);
    const { email } = z.object({ email: z.email() }).parse(await req.json());
    if (!isOrganizer({ uid: "dev", email, emailVerified: true, claims: {} })) {
      throw new RaffleError("FORBIDDEN", `${email} is not in ORGANIZER_EMAILS.`);
    }
    const res = NextResponse.json({ ok: true, email });
    setSessionCookie(res, createDevSession(email));
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
