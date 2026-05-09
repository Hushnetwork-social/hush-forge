import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { execSync } from "child_process";
import { writeFile } from "fs/promises";
import * as path from "path";
import {
  assertNeoNetworkMagic,
  loadForgeWalletHarnessConfig,
  startLocalWalletConnectRelay,
  startWalletConnectHarnessRuntime,
  type LocalWalletConnectRelay,
  type WalletConnectHarnessRequest,
  type WalletConnectHarnessRuntime,
} from "@hushnetwork/forge-wallet-harness";

const DOCKER_COMPOSE_DIR = process.env.NEO3_PRIVATENET_DOCKER_DIR
  ? path.resolve(process.env.NEO3_PRIVATENET_DOCKER_DIR)
  : path.resolve(__dirname, "../../../neo3-privatenet-docker");
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
let harnessEvidenceAttached = false;
let lastRpcMagic: number | null = null;
let walletRuntime: WalletConnectHarnessRuntime | null = null;

type HarnessEvidence = {
  account: string;
  chainId: string;
  expectedMagic: number;
  relayUrl: string;
  requests: WalletConnectHarnessRequest[];
  rpcMagic: number | null;
  rpcUrl: string;
};

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
    harnessEvidenceAttached = false;
    walletRuntime = null;

    resetChain();
    await waitForChain();
    await waitForFunding(harnessConfig.account.address);
    lastRpcMagic = await assertNeoNetworkMagic({
      expectedMagic: harnessConfig.expectedMagic,
      rpcUrl: harnessConfig.rpcUrl,
    });

    const factoryHash = deployFactoryAndParseHash();
    walletRuntime = await startWalletRuntime(testInfo);
    await installWalletConnectHarness(page, factoryHash, walletRuntime);
  });

  test.afterEach(async ({}, testInfo) => {
    await attachHarnessEvidence(testInfo).catch(async (error: unknown) => {
      await testInfo.attach("walletconnect-harness-evidence-error.txt", {
        body: error instanceof Error ? error.stack ?? error.message : String(error),
        contentType: "text/plain",
      });
    });
    await walletRuntime?.close();
    walletRuntime = null;
  });

  test("Forge creation signs through AppKit WalletConnect and the harness wallet", async ({
    page,
  }, testInfo) => {
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

    const invokeRequest = await waitForHarnessRequest("invokeFunction");
    await expectTransactionHalted(extractTxid(invokeRequest.result));
    await expectAndAttachHarnessEvidence(testInfo);
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

async function waitForHarnessRequest(
  method: string,
  timeoutMs = 120_000,
  pollMs = 1_000
): Promise<WalletConnectHarnessRequest> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const request = findLastRequest(walletRuntime?.listRequests() ?? [], method);
    if (request?.status === "approved") {
      return request;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`Harness did not approve ${method} after ${timeoutMs}ms.`);
}

async function attachHarnessEvidence(
  testInfo: TestInfo
): Promise<HarnessEvidence | null> {
  if (harnessEvidenceAttached || !walletRuntime) {
    return null;
  }

  const evidence: HarnessEvidence = {
    account: harnessConfig.account.address,
    chainId: harnessConfig.chainId,
    expectedMagic: harnessConfig.expectedMagic,
    relayUrl: harnessConfig.relayUrl,
    requests: walletRuntime.listRequests(),
    rpcMagic: lastRpcMagic,
    rpcUrl: harnessConfig.rpcUrl,
  };

  const evidencePath = testInfo.outputPath("walletconnect-harness-evidence.json");
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  await testInfo.attach("walletconnect-harness-evidence.json", {
    path: evidencePath,
    contentType: "application/json",
  });
  harnessEvidenceAttached = true;

  return evidence;
}

async function expectAndAttachHarnessEvidence(
  testInfo: TestInfo
): Promise<void> {
  const evidence = await attachHarnessEvidence(testInfo);
  const requests = evidence?.requests ?? walletRuntime?.listRequests() ?? [];

  const networkRequest = findLastRequest(requests, "getNetworkVersion");
  if (!networkRequest) {
    throw new Error("Harness evidence did not capture getNetworkVersion.");
  }
  expect(networkRequest).toMatchObject({
    result: expect.objectContaining({
      protocol: { network: harnessConfig.expectedMagic },
      rpcAddress: harnessConfig.rpcUrl,
    }),
    status: "approved",
    topic: expect.any(String),
  });
  expect(networkRequest.topic.length).toBeGreaterThan(0);

  const invokeRequest = findLastRequest(requests, "invokeFunction");
  if (!invokeRequest) {
    throw new Error("Harness evidence did not capture invokeFunction.");
  }
  expect(invokeRequest).toMatchObject({
    status: "approved",
    topic: expect.any(String),
  });
  expect(invokeRequest.topic.length).toBeGreaterThan(0);
  expect(extractTxid(invokeRequest.result)).toMatch(/^(0x)?[0-9a-f]{64}$/i);

  const invokeParams = invokeRequest.params as {
    invocations?: Array<{ operation?: string; scriptHash?: string }>;
  };
  expect(invokeParams.invocations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        operation: "transfer",
      }),
    ])
  );
}

async function expectTransactionHalted(txid: string): Promise<void> {
  expect(txid).toMatch(/^(0x)?[0-9a-f]{64}$/i);

  const log = (await waitForRpcResult("getapplicationlog", [txid], {
    timeoutMs: 120_000,
  })) as {
    executions?: Array<{ vmstate?: string }>;
  };

  expect(log.executions?.[0]?.vmstate).toBe("HALT");
}

async function waitForRpcResult(
  method: string,
  params: unknown[],
  {
    pollMs = 1_000,
    timeoutMs = 60_000,
  }: { pollMs?: number; timeoutMs?: number } = {}
): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await rpcCall(method, params);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`RPC ${method} did not return after ${timeoutMs}ms.`);
}

function findLastRequest(
  requests: WalletConnectHarnessRequest[],
  method: string
): WalletConnectHarnessRequest | undefined {
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    if (requests[index].method === method) {
      return requests[index];
    }
  }
  return undefined;
}

function extractTxid(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "txid" in result) {
    return String((result as { txid?: unknown }).txid ?? "");
  }
  return "";
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
  const res = await fetch(harnessConfig.rpcUrl, {
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
