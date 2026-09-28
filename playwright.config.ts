import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    // Always start a dedicated server for E2E so Cloudflare init cannot hang the suite.
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      SKIP_OPENNEXT_CLOUDFLARE_DEV: "1",
    },
  },
});
