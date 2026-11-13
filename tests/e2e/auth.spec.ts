import { expect, test } from "@playwright/test";
import { ORIGIN } from "./helpers";

test("signed-out visitors are redirected from the dashboard to sign-in", async ({ page }) => {
  await page.goto("/admin/control");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fcontrol/);
  await expect(page.getByText("Organizer sign-in")).toBeVisible();
});

test("organizer APIs reject unauthenticated requests", async ({ request }) => {
  const get = await request.get("/api/admin/participants?env=demo");
  expect(get.status()).toBe(401);
  const draw = await request.post("/api/admin/draws", { data: { env: "demo", prizeId: "x", idempotencyKey: "abcdefgh123" }, headers: ORIGIN });
  expect(draw.status()).toBe(401);
});

test("non-allowlisted accounts cannot sign in", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#dev-email", "intruder@example.com");
  await page.getByRole("button", { name: "Continue (dev)" }).click();
  await expect(page.getByText(/not in ORGANIZER_EMAILS/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("cross-origin state changes are blocked even with a valid session", async ({ page }) => {
  await page.request.post("/api/auth/dev-login", { data: { email: "organizer@example.com" }, headers: ORIGIN });
  const res = await page.request.post("/api/admin/raffle", { data: { env: "demo", action: "pause" }, headers: { Origin: "https://evil.example" } });
  expect(res.status()).toBe(403);
});

test("the public projector endpoint never exposes emails", async ({ page, request }) => {
  await page.request.post("/api/auth/dev-login", { data: { email: "organizer@example.com" }, headers: ORIGIN });
  await page.request.get("/api/admin/state?env=demo"); // seed demo
  const res = await request.get("/api/display?env=demo");
  const text = await res.text();
  expect(res.ok()).toBeTruthy();
  expect(text).not.toMatch(/@/);
});
