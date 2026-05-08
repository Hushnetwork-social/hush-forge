import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { execSync } from "child_process";
import * as path from "path";
import {
  assertNeoNetworkMagic,
  loadForgeWalletHarnessConfig,
  startLocalWalletConnectRelay,
  startWalletConnectHarnessRuntime,
  type LocalWalletConnectRelay,
  type WalletConnectHarnessRuntime,
} from "../../tools/forge-wallet-harness";

const DOCKER_COMPOSE_DIR = path.resolve(
  __dirname,
  "../../../neo3-privatenet-docker"
);
const FORGE_ROOT_DIR = path.resolve(__dirname, "../..");
const NEO_RPC_URL = "http://localhost:10332";
const RELAY_PORT = 32102;
const FACTORY_HASH_STORAGE_KEY = "forge_factory_hash";
const WALLET_STORAGE_KEY = "forge_wallet_type";
const WALLET_RESET_SESSION_KEY = "forge_appkit_wallet_reset_done";

const harnessConfig = loadForgeWalletHarnessConfig({
  ...process.env,
  FORGE_WALLET_HARNESS_RELAY_URL: `ws://127.0.0.1:${RELAY_PORT}`,
  FORGE_WALLET_HARNESS_REOWN_PROJECT_ID: "forge-local-project",
  FORGE_WALLET_HARNESS_RPC_URL:
    process.env.FORGE_WALLET_HARNESS_RPC_URL ?? NEO_RPC_URL,
});

let relay: LocalWalletConnectRelay | null = null;
let walletRuntime: WalletConnectHarnessRuntime | null = null;

test.describe("FEAT-122 FORGE AppKit WalletConnect harness integration", () => {
  test.beforeAll(async () => {
    relay = await startLocalWalletConnectRelay(RELAY_PORT);
  });

  test.afterAll(async () => {
    await relay?.close();
    relay = null;
  });

  test.beforeEach(async ({ page }, testInfo) => {
    await walletRuntime?.close();
    walletRuntime = null;

    resetChain();
    await waitForChain();
    await waitForFunding(harnessConfig.account.address);
    await assertNeoNetworkMagic({
      expectedMagic: harnessConfig.expectedMagic,
      rpcUrl: harnessConfig.rpcUrl,
    });

    const factoryHash = deployFactoryAndParseHash();
    walletRuntime = await startWalletRuntime(testInfo);
    await installWalletConnectHarness(page, factoryHash, walletRuntime);
  });

  test.afterEach(async () => {
    await walletRuntime?.close();
    walletRuntime = null;
  });

  test("Forge creation signs through AppKit WalletConnect and the harness wallet", async ({
    page,
  }) => {
    await page.goto("/tokens");
    await ensureWalletConnectConnected(page);

    await page.getByRole("button", { name: "Forge Token" }).click();

    const overlay = page.getByRole("dialog", { name: "Forge a Token" });
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    await overlay.getByLabel("Token Name").fill("AppKit Harness Token");
    await overlay.getByLabel(/^Symbol/).fill("AKHT");
    await overlay.getByLabel("Total Supply").fill("1000000");
    await overlay.getByLabel(/^Decimals/).fill("8");

    await expect(overlay.getByRole("button", { name: /FORGE/ })).toBeEnabled({
      timeout: 30_000,
    });

    await overlay.getByRole("button", { name: /FORGE/ }).click();

    await expectCreatedTokenCard(page, "AKHT");
  });
});

async function startWalletRuntime(
  testInfo: TestInfo
): Promise<WalletConnectHarnessRuntime> {
  return startWalletConnectHarnessRuntime(harnessConfig, {
    projectId: harnessConfig.projectId,
    relayUrl: harnessConfig.relayUrl,
    storagePrefix: `forge-appkit-e2e-${testInfo.workerIndex}-${Date.now()}`,
  });
}

async function installWalletConnectHarness(
  page: Page,
  factoryHash: string,
  runtime: WalletConnectHarnessRuntime
): Promise<void> {
  await page.exposeFunction(
    "__FORGE_WALLETCONNECT_PAIR_URI",
    async (uri: string) => runtime.pair(uri)
  );

  await page.addInitScript(
    ({
      factoryHash,
      factoryHashStorageKey,
      walletStorageKey,
      walletResetSessionKey,
    }: {
      factoryHash: string;
      factoryHashStorageKey: string;
      walletResetSessionKey: string;
      walletStorageKey: string;
    }) => {
      window.localStorage.setItem(factoryHashStorageKey, factoryHash);
      if (!window.sessionStorage.getItem(walletResetSessionKey)) {
        window.localStorage.removeItem(walletStorageKey);
        window.sessionStorage.setItem(walletResetSessionKey, "true");
      }
    },
    {
      factoryHash,
      factoryHashStorageKey: FACTORY_HASH_STORAGE_KEY,
      walletResetSessionKey: WALLET_RESET_SESSION_KEY,
      walletStorageKey: WALLET_STORAGE_KEY,
    }
  );
}

async function ensureWalletConnectConnected(page: Page): Promise<void> {
  const prefix = harnessConfig.account.address.slice(0, 6);

  if (await hasVisibleAddressPrefix(page, prefix, 15_000)) {
    return;
  }

  const connectButton = page.getByRole("button", { name: /Connect Wallet/i }).first();
  await expect(connectButton).toBeEnabled({ timeout: 45_000 });
  await connectButton.click();
  await page
    .getByRole("button", { name: "WalletConnect / Neon Wallet" })
    .click();

  await expect(page.getByText(new RegExp(prefix)).first()).toBeVisible({
    timeout: 60_000,
  });
}

async function hasVisibleAddressPrefix(
  page: Page,
  prefix: string,
  timeoutMs = 5_000
): Promise<boolean> {
  return page
    .waitForFunction(
      (addressPrefix: string) =>
        document.body.textContent?.includes(addressPrefix) ?? false,
      prefix,
      { timeout: timeoutMs }
    )
    .then(() => true)
    .catch(() => false);
}

async function expectCreatedTokenCard(
  page: Page,
  symbol: string
): Promise<void> {
  const createdTokenCard = page
    .getByRole("article")
    .filter({ hasText: symbol })
    .first();
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    if (await createdTokenCard.isVisible().catch(() => false)) {
      await expect(createdTokenCard).toContainText("Yours");
      return;
    }

    await ensureWalletConnectConnected(page);
    await page.waitForTimeout(1_000);
  }

  await expect(createdTokenCard).toBeVisible({ timeout: 1 });
}

function resetChain(): void {
  execSync("docker compose down --volumes --remove-orphans", {
    cwd: DOCKER_COMPOSE_DIR,
    stdio: "inherit",
  });
  execSync("docker compose up --detach", {
    cwd: DOCKER_COMPOSE_DIR,
    stdio: "inherit",
  });
}

async function waitForChain(timeoutMs = 90_000, pollMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await rpcCall("getblockcount", []);
      if (typeof result === "number" && result >= 1) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Chain RPC not ready after ${timeoutMs}ms`);
}

async function waitForFunding(
  address: string,
  timeoutMs = 120_000,
  pollMs = 3_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = (await rpcCall("getnep17balances", [address])) as {
        balance?: unknown[];
      };
      if ((result.balance ?? []).length >= 2) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Account ${address} not funded after ${timeoutMs}ms`);
}

function deployFactoryAndParseHash(): string {
  const output = execSync("node scripts/deploy-factory.cjs", {
    cwd: FORGE_ROOT_DIR,
    encoding: "utf8",
  });
  const match = output.match(
    /NEXT_PUBLIC_FACTORY_CONTRACT_HASH=(0x[0-9a-fA-F]{40})/
  );
  if (!match) {
    throw new Error(`Could not parse factory hash from deploy output:\n${output}`);
  }
  return match[1].toLowerCase();
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(NEO_RPC_URL, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    result?: unknown;
  };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
}
