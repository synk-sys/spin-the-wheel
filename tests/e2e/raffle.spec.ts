import { expect, test } from "@playwright/test";
import { api, login, resetDemo, useEnv } from "./helpers";

test.describe.configure({ mode: "serial" });

test("demo: spin on control, projector animates and reveals the server-selected winner", async ({ page, context }) => {
  await login(page);
  await resetDemo(page);
  await useEnv(page, "demo");

  const display = await context.newPage();
  await display.setViewportSize({ width: 1920, height: 1080 });
  await display.goto("/display?env=demo");
  await expect(display.getByText("Demo mode")).toBeVisible();
  await expect(display.getByTestId("connection-status")).toContainText("Live");

  await page.goto("/admin/control");
  await expect(page.getByText("DEMO MODE")).toBeVisible();
  const spin = page.getByTestId("spin-button");
  await expect(spin).toBeEnabled();
  await spin.click();
  // Double-clicks can't start a second draw: the button disables immediately.
  await expect(spin).toBeDisabled();

  await expect(display.getByText("Drawing now…")).toBeVisible();
  await expect(display.getByTestId("winner-reveal")).toHaveCount(0); // previous reveal finished fading out
  await expect(display.getByTestId("winner-reveal")).toBeVisible({ timeout: 15_000 });
  const projectorName = (await display.getByTestId("winner-name").textContent())!.trim();

  const winnerCard = page.getByTestId("current-winner");
  await expect(winnerCard).toContainText(projectorName);
  await expect(winnerCard).toContainText("announced", { ignoreCase: true });

  await page.getByRole("button", { name: "Confirm winner" }).click();
  await expect(winnerCard).toContainText("confirmed", { ignoreCase: true });
  await page.getByRole("button", { name: "Mark prize claimed" }).click();
  await expect(winnerCard).toContainText("claimed", { ignoreCase: true });

  await page.goto("/admin/history");
  const row = page.getByRole("row", { name: new RegExp(projectorName) });
  await expect(row).toContainText("300"); // eligible pool size at draw time
  await expect(row).toContainText("Claimed");
});

test("projector reconnecting after a spin shows the result without replaying it", async ({ page, context }) => {
  await login(page);
  const display = await context.newPage();
  await display.setViewportSize({ width: 1920, height: 1080 });
  const t0 = Date.now();
  await display.goto("/display?env=demo");
  await expect(display.getByTestId("winner-reveal")).toBeVisible({ timeout: 4000 });
  // A replayed spin would take ~7s; the reveal appears right away instead.
  expect(Date.now() - t0).toBeLessThan(5000);
  await expect(display.getByText("Drawing now…")).toHaveCount(0);
});

test("void and redraw keeps history and excludes the voided winner", async ({ page, context }) => {
  await login(page);
  await useEnv(page, "demo");
  const display = await context.newPage();
  await display.goto("/display?env=demo");

  await page.goto("/admin/control");
  // The first prize (quantity 1) was won in the first test; move to the next one.
  await page.getByRole("button", { name: "Next prize" }).click();
  await expect(page.getByLabel("Current prize")).toHaveValue(/prz_/);
  await expect(page.getByTestId("spin-button")).toBeEnabled();
  await page.getByTestId("spin-button").click();
  // Wait for the new spin to start (the previous reveal clears), then for its reveal.
  await expect(display.getByText("Drawing now…")).toBeVisible();
  await expect(display.getByTestId("winner-reveal")).toHaveCount(0); // previous reveal finished fading out
  await expect(display.getByTestId("winner-reveal")).toBeVisible({ timeout: 15_000 });
  const voided = (await display.getByTestId("winner-name").textContent())!.trim();

  await page.getByRole("button", { name: /Void/ }).click();
  await page.getByLabel("Reason (required)").fill("Not present after three calls");
  await page.getByRole("button", { name: "Void draw" }).click();
  await expect(display.getByTestId("winner-reveal")).toHaveCount(0);
  await expect(page.getByTestId("current-winner")).toContainText("voided", { ignoreCase: true });

  await page.getByTestId("spin-button").click();
  await expect(display.getByText("Drawing now…")).toBeVisible();
  await expect(display.getByTestId("winner-reveal")).toHaveCount(0); // previous reveal finished fading out
  await expect(display.getByTestId("winner-reveal")).toBeVisible({ timeout: 15_000 });
  const second = (await display.getByTestId("winner-name").textContent())!.trim();

  const draws = (await (await page.request.get("/api/admin/draws?env=demo")).json()).draws as { status: string; winnerNameSnapshot: string; voidReason: string | null }[];
  expect(draws).toHaveLength(3);
  expect(draws[0].status).toBe("claimed");
  expect(draws[1].status).toBe("voided");
  expect(["selected", "announced"]).toContain(draws[2].status);
  const v = draws.find((d) => d.status === "voided")!;
  expect(v.winnerNameSnapshot).toBe(voided);
  expect(v.voidReason).toBe("Not present after three calls");
  expect(draws.at(-1)!.winnerNameSnapshot).toBe(second);
});

test("production: CSV import with dedup report, refusal to re-import, isolated from demo", async ({ page }) => {
  await login(page);
  await useEnv(page, "production");
  const rows = ["attendeeId,name,email,ticketNumber,company"];
  for (let i = 1; i <= 300; i++) rows.push(`${String(i).padStart(3, "0")},Attendee ${i},a${i}@example.com,DF${i},"Company, Inc."`);
  rows.push("001,Duplicate Id,dup@example.com,DFX1,");
  rows.push("999,Duplicate Email,A5@EXAMPLE.COM,DFX2,");
  rows.push(",,,,");
  rows.push("998,Bad Email,not-an-email,DFX3,");
  const csv = rows.join("\n");

  await page.goto("/admin/participants/import");
  await expect(page.getByText("PRODUCTION — real attendees")).toBeVisible();
  await page.getByTestId("csv-input").setInputFiles({ name: "attendees.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  const summary = page.getByTestId("import-summary");
  await expect(summary).toContainText("Rows303"); // the fully empty row is skipped by the parser
  await expect(summary).toContainText("Ready300");
  await expect(summary).toContainText("Dupes in file2");
  await expect(summary).toContainText("Invalid1");

  await page.getByTestId("import-continue").click();
  await page.getByTestId("import-confirm").click();
  await expect(page.getByText("300 participants imported")).toBeVisible();

  // Same file again: the server refuses.
  await page.getByTestId("csv-input").setInputFiles({ name: "attendees.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  // Every row now matches an existing attendee (the 2 in-file dupes do too), so nothing is ready.
  await expect(page.getByTestId("import-summary")).toContainText("Ready0");
  await expect(page.getByTestId("import-summary")).toContainText("Already imported302");

  const prod = await (await page.request.get("/api/admin/participants?env=production")).json();
  expect(prod.participants).toHaveLength(300);
  const demo = await (await page.request.get("/api/admin/participants?env=demo")).json();
  expect(demo.participants.every((p: { attendeeId: string }) => p.attendeeId.startsWith("DEMO-"))).toBe(true);

  // Re-posting the identical import directly is refused (idempotent import).
  const again = await api(page, "/api/admin/participants/import", {
    env: "production",
    rows: rows.slice(1, 301).map((line) => {
      const [attendeeId, name, email, ticketNumber] = line.split(",");
      return { attendeeId, name, email, ticketNumber, company: "Company, Inc." };
    }),
  });
  expect(again.status).toBe(409);
});
