import { expect, type Page } from "@playwright/test";

export const BASE = "http://localhost:3200";
export const ORIGIN = { Origin: BASE };

export async function login(page: Page, email = "organizer@example.com") {
  const res = await page.request.post("/api/auth/dev-login", { data: { email }, headers: ORIGIN });
  expect(res.ok()).toBeTruthy();
}

export async function api(page: Page, path: string, data: Record<string, unknown>) {
  const res = await page.request.post(path, { data, headers: ORIGIN });
  return { status: res.status(), body: await res.json() };
}

export async function resetDemo(page: Page) {
  // First call initializes + seeds the demo env; reset guarantees a clean slate.
  await page.request.get("/api/admin/state?env=demo");
  const r = await api(page, "/api/admin/raffle", { env: "demo", action: "reset-demo", confirmation: "RESET DEMO" });
  expect(r.status).toBe(200);
}

export async function useEnv(page: Page, env: "demo" | "production") {
  await page.addInitScript((e) => localStorage.setItem("devfest-raffle-env", e), env);
}
