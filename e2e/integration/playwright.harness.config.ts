import { defineConfig } from "@playwright/test";
import * as path from "path";

export default defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: "forge-wallet-harness.spec.ts",
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report-harness" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3101",
    headless: true,
    screenshot: "on",
    trace: "on",
    video: "on",
  },
  webServer: {
    command: "npm run dev -- --port 3101",
    env: {
      NEXT_PUBLIC_FACTORY_CONTRACT_HASH: "0x",
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://localhost:3101",
  },
});
