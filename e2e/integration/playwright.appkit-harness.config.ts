import { defineConfig } from "@playwright/test";
import * as path from "path";

export default defineConfig({
  testDir: path.resolve(__dirname),
  testMatch: "forge-appkit-walletconnect-harness.spec.ts",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report-appkit-harness" }],
    ["list"],
  ],
  use: {
    baseURL: "http://localhost:3103",
    headless: true,
    screenshot: "on",
    trace: "on",
    video: "on",
  },
  webServer: {
    command: "npm run dev -- --port 3103",
    env: {
      NEO_RPC_TARGET: "http://127.0.0.1:10332",
      NEXT_PUBLIC_FACTORY_CONTRACT_HASH: "0x",
      NEXT_PUBLIC_FORGE_WALLETCONNECT_APPKIT_ENABLED: "true",
      NEXT_PUBLIC_NEO_RPC_URL: "/api/rpc",
      NEXT_PUBLIC_REOWN_PROJECT_ID: "forge-local-project",
      NEXT_PUBLIC_REOWN_RELAY_URL: "ws://127.0.0.1:32102",
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://localhost:3103",
  },
});
