import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDevSession, isDevAuthEnabled, isOrganizer, organizerAllowlist, verifyDevSession } from "@/lib/auth/session";

const BASE = "http://localhost:3000";

function req(path: string, init: { method?: string; cookie?: string; origin?: string | null; body?: unknown } = {}) {
  const headers = new Headers({ host: "localhost:3000" });
  if (init.cookie) headers.set("cookie", `__session=${init.cookie}`);
  if (init.origin !== null) headers.set("origin", init.origin ?? BASE);
  if (init.body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

const ctx = { params: Promise.resolve({}) };

beforeAll(() => {
  vi.stubEnv("AUTH_MODE", "dev");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ORGANIZER_EMAILS", "organizer@example.com, Lead@Example.com");
  vi.stubEnv("DEV_SESSION_SECRET", "unit-test-secret");
  vi.stubEnv("MEMORY_STORE_FILE", "");
});

afterEach(() => {
  vi.stubEnv("AUTH_MODE", "dev");
  vi.stubEnv("NODE_ENV", "test");
});

describe("organizer policy", () => {
  it("parses the allowlist case-insensitively", () => {
    expect(organizerAllowlist("a@x.com, B@X.com\nc@x.com")).toEqual(new Set(["a@x.com", "b@x.com", "c@x.com"]));
  });

  it("requires a verified email that is allowlisted or carries the organizer claim", () => {
    const allow = new Set(["lead@example.com"]);
    expect(isOrganizer({ uid: "1", email: "Lead@example.com", emailVerified: true, claims: {} }, allow)).toBe(true);
    expect(isOrganizer({ uid: "1", email: "lead@example.com", emailVerified: false, claims: {} }, allow)).toBe(false);
    expect(isOrganizer({ uid: "1", email: "other@example.com", emailVerified: true, claims: {} }, allow)).toBe(false);
    expect(isOrganizer({ uid: "1", email: "other@example.com", emailVerified: true, claims: { organizer: true } }, allow)).toBe(true);
    expect(isOrganizer({ uid: "1", email: null, emailVerified: true, claims: { organizer: true } }, allow)).toBe(false);
  });
});

describe("dev sessions", () => {
  it("round-trips a signed token and rejects tampering and expiry", () => {
    const token = createDevSession("organizer@example.com", 1000);
    expect(verifyDevSession(token, 2000)?.email).toBe("organizer@example.com");
    const [p, payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "evil@example.com", exp: 9e15 })).toString("base64url");
    expect(verifyDevSession(`${p}.${forged}.${sig}`, 2000)).toBeNull();
    expect(verifyDevSession(`${p}.${payload}.${sig}x`, 2000)).toBeNull();
    expect(verifyDevSession(token, 1000 + 9 * 60 * 60 * 1000)).toBeNull();
  });

  it("can never be enabled in production builds", () => {
    expect(isDevAuthEnabled({ AUTH_MODE: "dev", NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(verifyDevSession(createDevSession("organizer@example.com"))).toBeNull();
  });
});

describe("API authorization (real route handlers)", () => {
  it("rejects unauthenticated, forged, non-organizer, and cross-origin requests", async () => {
    const { GET } = await import("@/app/api/admin/participants/route");
    const { POST } = await import("@/app/api/admin/draws/route");

    expect((await GET(req("/api/admin/participants?env=demo"), ctx)).status).toBe(401);
    expect((await GET(req("/api/admin/participants?env=demo", { cookie: "dev.garbage.sig" }), ctx)).status).toBe(401);

    const outsider = createDevSession("outsider@example.com");
    expect((await GET(req("/api/admin/participants?env=demo", { cookie: outsider }), ctx)).status).toBe(403);

    const organizer = createDevSession("organizer@example.com");
    const body = { env: "demo", prizeId: "x", idempotencyKey: "abcdefgh1234" };
    expect((await POST(req("/api/admin/draws", { method: "POST", cookie: organizer, body, origin: "https://evil.example" }), ctx)).status).toBe(403);
    expect((await POST(req("/api/admin/draws", { method: "POST", cookie: organizer, body, origin: null }), ctx)).status).toBe(403);
    expect((await POST(req("/api/admin/draws", { method: "POST", body }), ctx)).status).toBe(401);
  });

  it("lets an allowlisted organizer through and validates input", async () => {
    const { GET } = await import("@/app/api/admin/participants/route");
    const { POST } = await import("@/app/api/admin/draws/route");
    const organizer = createDevSession("lead@example.com");
    const ok = await GET(req("/api/admin/participants?env=demo", { cookie: organizer }), ctx);
    expect(ok.status).toBe(200);
    expect((await ok.json()).participants).toHaveLength(300);

    const badEnv = await GET(req("/api/admin/participants?env=staging", { cookie: organizer }), ctx);
    expect(badEnv.status).toBe(400);
    const badKey = await POST(req("/api/admin/draws", { method: "POST", cookie: organizer, body: { env: "demo", prizeId: "x", idempotencyKey: "short" } }), ctx);
    expect(badKey.status).toBe(400);
  });

  it("dev login refuses non-allowlisted emails and is hidden in production", async () => {
    const { POST } = await import("@/app/api/auth/dev-login/route");
    expect((await POST(req("/api/auth/dev-login", { method: "POST", body: { email: "nope@example.com" } }))).status).toBe(403);
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(req("/api/auth/dev-login", { method: "POST", body: { email: "organizer@example.com" } }))).status).toBe(404);
  });
});
