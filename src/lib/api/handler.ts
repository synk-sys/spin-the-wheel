import "server-only";
import { unstable_rethrow } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { assertSameOriginRequest } from "../auth/cookies";
import { authorizeCookie } from "../auth/server";
import { SESSION_COOKIE } from "../auth/session";
import { isRaffleError, RaffleError } from "../domain/errors";
import { raffleEnvSchema, type RaffleEnv } from "../domain/types";
import { RaffleService, type Actor } from "../raffle/service";
import { getStore } from "../store";

export async function getService(): Promise<RaffleService> {
  return new RaffleService(await getStore());
}

export function errorResponse(e: unknown): NextResponse {
  // Let Next.js internal control-flow errors (e.g. prerender bail-out) propagate.
  unstable_rethrow(e);
  if (isRaffleError(e)) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const message = e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: { code: "VALIDATION", message, details: e.issues } }, { status: 400 });
  }
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on the server. Nothing was changed if the action failed." } }, { status: 500 });
}

export interface OrganizerContext {
  actor: Actor;
  env: RaffleEnv;
  service: RaffleService;
  body: Record<string, unknown>;
}

type Handler<P> = (req: NextRequest, ctx: OrganizerContext, params: P) => Promise<Response | unknown>;

/**
 * Wraps a route handler with: same-origin check, organizer authentication and
 * authorization (server-side, every request), environment resolution, JSON
 * body parsing, and consistent error mapping.
 */
export function organizerRoute<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }) => {
    try {
      assertSameOriginRequest(req);
      const auth = await authorizeCookie(req.cookies.get(SESSION_COOKIE)?.value);
      if (!auth.ok) {
        throw new RaffleError(auth.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN", auth.status === 401 ? "Please sign in." : "This account is not an authorized organizer.");
      }
      let body: Record<string, unknown> = {};
      if (req.method !== "GET" && req.method !== "HEAD") {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) throw new RaffleError("VALIDATION", "Expected a JSON body");
        body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
        if (typeof body !== "object" || Array.isArray(body)) throw new RaffleError("VALIDATION", "Expected a JSON object");
      }
      const envRaw = req.nextUrl.searchParams.get("env") ?? body.env;
      const env = raffleEnvSchema.parse(envRaw);
      const service = await getService();
      const params = (await routeCtx.params) ?? ({} as P);
      const out = await handler(req, { actor: auth.actor, env, service, body }, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return errorResponse(e);
    }
  };
}
