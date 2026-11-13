import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // tests share one server-side raffle state
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATA_BACKEND: "memory",
      MEMORY_STORE_FILE: "",
      AUTH_MODE: "dev",
      ORGANIZER_EMAILS: "organizer@example.com,second@example.com",
      DEV_SESSION_SECRET: "e2e-only-secret",
      NEXT_PUBLIC_DISPLAY_SYNC: "poll",
    },
  },
});
