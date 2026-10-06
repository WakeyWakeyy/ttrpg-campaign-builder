import { randomUUID } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.e2e.local", quiet: true });
// Propagated to workers and the owned server; never reuse a development server.
process.env.E2E_SCHEMA ??= `a10_${randomUUID().replaceAll("-", "")}`;
const database = process.env.E2E_DATABASE_URL;
if (!database) throw new Error("E2E_DATABASE_URL must explicitly name a dedicated test database.");
const url = new URL(database);
if (!/(?:^|_)(?:test|e2e)(?:_|$)/.test(url.pathname.slice(1))) {
  throw new Error("E2E_DATABASE_URL database name must contain a test or e2e segment.");
}
url.searchParams.set("options", `-c search_path=${process.env.E2E_SCHEMA},public`);
process.env.E2E_SCOPED_DATABASE_URL = url.toString();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: url.toString() },
  },
});
