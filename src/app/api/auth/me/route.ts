import { NextResponse, type NextRequest } from "next/server";
import { verifySessionValue } from "@/lib/auth/server";
import { isDevAuthEnabled, isOrganizer, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const identity = await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value);
  return NextResponse.json(
    {
      authenticated: identity !== null,
      email: identity?.email ?? null,
      organizer: identity ? isOrganizer(identity) : false,
      devAuth: isDevAuthEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
