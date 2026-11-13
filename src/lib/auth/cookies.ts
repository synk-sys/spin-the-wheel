import type { NextRequest, NextResponse } from "next/server";
import { RaffleError } from "../domain/errors";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "./session";

export function setSessionCookie(res: NextResponse, value: string) {
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
}

/**
 * Rejects cross-site state-changing requests. Combined with a SameSite=Strict
 * session cookie and JSON-only bodies this prevents CSRF.
 */
export function assertSameOriginRequest(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new RaffleError("FORBIDDEN", "Missing origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new RaffleError("FORBIDDEN", "Bad origin");
  }
  if (originHost !== host.split(",")[0].trim()) throw new RaffleError("FORBIDDEN", "Cross-origin request blocked");
}
