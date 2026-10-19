import { defineConfig } from "@playwright/test";
if (!process.env.E2E_USERNAME || !process.env.E2E_PASSWORD || !new URL(process.env.DATABASE_URL ?? "postgres://localhost/invalid").pathname.startsWith("/tmw_test_")) {
  throw new Error("Browser tests require an isolated database. Run pnpm test:e2e:isolated.");
}
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5178",
    headless: true,
    channel: "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    env: { RELEASE_VERSION: "synthetic-e2e-release", RELEASE_ID: "synthetic-e2e-release-id" },
    url: "http://127.0.0.1:5178/api/health",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
