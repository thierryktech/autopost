import { defineConfig, devices } from "@playwright/test";

/*
 * E2E tests run against a production build in demo mode with a fresh, isolated PGlite database.
 *   pnpm build && pnpm test:e2e
 */
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "macbook", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `rm -rf .data/e2e && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: "pglite:.data/e2e/pglite",
      DATA_DIR: ".data/e2e",
      DEMO_FB_PUBLISH_DELAY_MS: "1000",
      AUTH_DISABLED: "true",
      ALLOW_INSECURE_NO_AUTH: "true", // test server only, never in a real deployment
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
