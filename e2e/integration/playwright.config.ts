import { defineConfig } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

// Load e2e/integration/.env.integration if it exists (local credentials, gitignored)
const envFile = path.resolve(__dirname, ".env.integration");
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const [key, ...vals] = line.split("=");
    if (key && !key.startsWith("#")) {
      process.env[key.trim()] = vals.join("=").trim();
    }
  }
}

/**
 * Playwright config for INTEGRATION tests.
 *
 * These tests run against the real:
 *   - NeoLine browser extension (loaded from e2e/wallet-profile/)
 *   - neo3-privatenet-docker chain (reset per test)
 *   - Next.js dev server on port 3000 (default, matches RPC CORS + NeoLine config)
 *
 * Run with: npm run test:integration
 *
 * Prerequisites:
 *   1. e2e/wallet-profile/ must exist (run e2e/setup-test-profile.ps1 once)
 *   2. Docker must be running (docker desktop)
 *   3. Next.js dev server will be started automatically
 */

export default defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: "**/*.spec.ts",
  globalTeardown: path.resolve(__dirname, "global-teardown.ts"),

  // Keep feedback fast while allowing chain reset + deploy + forge on privnet.
  timeout: 180_000,        // 3 min per test
  expect: { timeout: 10_000 },

  // Never run in parallel — each test resets the chain
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report-integration" }],
    ["list"],
  ],

  use: {
    baseURL: "http://localhost:3000",
    // Always record trace + screenshot + video for integration tests
    trace: "on",
    screenshot: "on",
    video: "on",
    // Headed required — NeoLine extension popup doesn't work headless
    headless: false,
  },

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Reuse if already running (dev workflow)
    reuseExistingServer: true,
    timeout: 30_000,
    // Extra memory for Next.js SWC webpack workers — prevents "Jest worker
    // exceeded retry limit" OOM crashes when compiling dynamic routes under
    // the memory pressure of concurrent Docker + Edge + compilation.
    env: {
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
  },
});

