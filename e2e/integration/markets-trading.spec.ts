import { test, expect, chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const WALLET_PROFILE_DIR = path.resolve(__dirname, "../wallet-profile");
const DOCKER_COMPOSE_DIR = path.resolve(
  __dirname,
  "../../../neo3-privatenet-docker"
);
const FORGE_ROOT_DIR = path.resolve(__dirname, "../..");
const BASE_URL = "http://localhost:3000";
const NEO_RPC_URL = "http://localhost:10332";
const NEOLINE_ID = "cphhlgmgameodnhkjdmkpanlelnlohao";
const FACTORY_HASH_STORAGE_KEY = "forge_factory_hash";
const ROUTER_HASH_STORAGE_KEY = "forge_bonding_curve_router_hash";
const CLIENT1_ADDRESS = "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c";
const NEOLINE_PASSWORD: string | undefined = process.env.NEOLINE_PASSWORD;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(NEO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? "RPC error");
  return json.result;
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
    await sleep(pollMs);
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
    await sleep(pollMs);
  }
  throw new Error(`Account ${address} not funded after ${timeoutMs}ms`);
}

function deployFactoryAndParseHash(): string {
  const output = execSync("node scripts/deploy-factory.cjs", {
    cwd: FORGE_ROOT_DIR,
    encoding: "utf8",
  });
  const match = output.match(/NEXT_PUBLIC_FACTORY_CONTRACT_HASH=(0x[0-9a-fA-F]{40})/);
  if (!match) {
    throw new Error(`Could not parse factory hash from deploy output:\n${output}`);
  }
  return match[1].toLowerCase();
}

function runFixture(args: string[]): string {
  return execFileSync("node", ["scripts/factory-governance-fixtures.cjs", ...args], {
    cwd: FORGE_ROOT_DIR,
    env: process.env,
    encoding: "utf8",
  });
}

function parseFixtureValue(output: string, key: string): string {
  const match = output.match(new RegExp(`${key}=(0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{64}|[^\\r\\n]+)`));
  if (!match) {
    throw new Error(`Could not parse ${key} from fixture output:\n${output}`);
  }
  return match[1].trim().toLowerCase();
}

function createProfileCopy(): string {
  if (!fs.existsSync(WALLET_PROFILE_DIR)) {
    throw new Error(
      `Wallet profile not found at ${WALLET_PROFILE_DIR}.\n` +
        "Run: powershell -ExecutionPolicy Bypass -File e2e/setup-test-profile.ps1"
    );
  }
  const tmpDir = path.resolve(__dirname, `../wallet-profile-tmp-${Date.now()}`);
  fs.cpSync(WALLET_PROFILE_DIR, tmpDir, { recursive: true });
  return tmpDir;
}

function removeProfileCopy(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

async function unlockNeoLinePage(page: Page): Promise<void> {
  const pwInput = page.locator('input[type="password"]');
  if (await pwInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await pwInput.click();
    await page.keyboard.type(NEOLINE_PASSWORD ?? "");
    await page.keyboard.press("Enter");
    await pwInput.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1_000);
  }
}

async function launchWithNeoLine(
  profileDir: string
): Promise<{ context: BrowserContext; page: Page }> {
  const profileExtBase = path.join(profileDir, "Default", "Extensions", NEOLINE_ID);
  const edgeExtBase = path.join(
    process.env.LOCALAPPDATA ?? "C:\\Users\\aboim\\AppData\\Local",
    "Microsoft",
    "Edge",
    "User Data",
    "Default",
    "Extensions",
    NEOLINE_ID
  );
  const extBase = fs.existsSync(profileExtBase) ? profileExtBase : edgeExtBase;
  const versionDirs = fs.readdirSync(extBase);
  const neoLineExtDir = path.join(extBase, versionDirs[0]);

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: "msedge",
    headless: false,
    slowMo: 300,
    args: [
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      `--disable-extensions-except=${neoLineExtDir}`,
      `--load-extension=${neoLineExtDir}`,
    ],
    viewport: { width: 1280, height: 900 },
  });

  const neoLinePage = await context.newPage();
  await neoLinePage.goto(`chrome-extension://${NEOLINE_ID}/index.html#popup`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await neoLinePage.waitForTimeout(2_000);
  await unlockNeoLinePage(neoLinePage);
  await neoLinePage.close();

  const page = await context.newPage();
  return { context, page };
}

async function signExistingNeoLinePopup(popup: Page): Promise<void> {
  await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await popup.locator(".loading-box").waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  await unlockNeoLinePage(popup);
  await popup
    .waitForFunction(() => {
      const btn = document.querySelector("button.confirm:not(.pop-ups)");
      return btn !== null && !btn.classList.contains("disabled");
    }, { timeout: 30_000 })
    .catch(() => {});

  await popup.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button.confirm")
    );
    const primary = buttons.find((item) => !item.classList.contains("pop-ups")) ?? buttons[0];
    primary?.click();
  });

  await popup
    .waitForFunction(() => document.querySelector("button.confirm.pop-ups") !== null, {
      timeout: 30_000,
    })
    .catch(() => {});

  if (!popup.isClosed()) {
    await popup.evaluate(() => {
      document.querySelector<HTMLButtonElement>("button.confirm.pop-ups")?.click();
    }).catch(() => {});
    await popup.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
  }
}

async function signInNeoLine(
  context: BrowserContext,
  trigger: () => Promise<void>,
  timeout = 60_000
): Promise<void> {
  const popupPromise = context.waitForEvent("page", { timeout });
  await trigger();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 });
  await signExistingNeoLinePopup(popup);
}

async function gotoWithRetry(page: Page, url: string, attempts = 3): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      return;
    } catch (err) {
      lastError = err;
      if (!String(err).includes("ERR_ABORTED") || attempt === attempts) {
        throw err;
      }
      await page.waitForTimeout(1_000);
    }
  }
  throw lastError;
}

async function warmupRoutes(context: BrowserContext): Promise<void> {
  const warmTargets = [
    `${BASE_URL}/markets/0x0000000000000000000000000000000000000000`,
    `${BASE_URL}/tokens/0x0000000000000000000000000000000000000000`,
  ];

  for (const target of warmTargets) {
    const warmPage = await context.newPage();
    await warmPage.goto(target, { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await warmPage.waitForTimeout(2_000);
    await warmPage.close();
  }
}

async function connectWalletFromCurrentPage(
  page: Page,
  context: BrowserContext
): Promise<void> {
  const alreadyConnected = await page.evaluate(
    (prefix: string) => document.body.textContent?.includes(prefix) ?? false,
    CLIENT1_ADDRESS.slice(0, 6)
  );
  if (alreadyConnected) return;

  await signInNeoLine(
    context,
    async () => {
      await page.getByRole("button", { name: /Connect Wallet/i }).first().click();
      const connectDialog = page.getByRole("dialog", { name: "Connect Wallet" });
      const neoLineBtn = connectDialog.getByRole("button", { name: /NeoLine/i }).first();
      if (await neoLineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await neoLineBtn.click();
      }
    },
    30_000
  );

  await page.waitForFunction(
    (prefix: string) => document.body.textContent?.includes(prefix) ?? false,
    CLIENT1_ADDRESS.slice(0, 6),
    { timeout: 35_000 }
  );
}

async function dismissAdminHintIfPresent(page: Page): Promise<void> {
  const overlay = page.getByTestId("admin-update-hint-overlay");
  if (await overlay.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const ok = page.getByRole("button", { name: "OK" });
    if (await ok.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await ok.click();
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await expect(overlay).toHaveCount(0, { timeout: 5_000 });
  }
}

async function waitForPendingTxHash(
  page: Page,
  expectedMessage: string
): Promise<string> {
  const storageTxHash = await page
    .waitForFunction(
      (message) => {
        const raw = window.localStorage.getItem("forge.pending.tx");
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as { txHash?: string; message?: string };
          if (
            typeof parsed.txHash === "string" &&
            typeof parsed.message === "string" &&
            parsed.message.includes(message)
          ) {
            return parsed.txHash;
          }
        } catch {
          return null;
        }
        return null;
      },
      expectedMessage,
      { timeout: 30_000 }
    )
    .then((handle) => handle.jsonValue<string | null>())
    .catch(() => null);

  if (storageTxHash) {
    return storageTxHash.toLowerCase();
  }

  const pendingToast = page.getByRole("status", {
    name: "Pending transaction status",
  });
  await expect(pendingToast).toContainText(expectedMessage, { timeout: 30_000 });
  const href = await pendingToast
    .getByRole("link", { name: /Track transaction on NeoTube/i })
    .getAttribute("href");
  const match = href?.match(/\/transaction\/(0x[0-9a-fA-F]{64})$/);
  if (!match) {
    throw new Error(`Could not parse tx hash from href: ${href}`);
  }
  return match[1].toLowerCase();
}

async function waitForTx(txid: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const log = (await rpcCall("getapplicationlog", [txid])) as {
        executions?: Array<{ trigger?: string; vmstate?: string; exception?: string }>;
      };
      const execution = log.executions?.find((item) => item.trigger === "Application");
      if (execution) {
        if (execution.vmstate === "FAULT") {
          throw new Error(execution.exception ?? "Transaction faulted");
        }
        return;
      }
    } catch (error) {
      if (String(error).toLowerCase().includes("fault")) throw error;
    }
    await sleep(3_000);
  }
  throw new Error(`Transaction ${txid} not confirmed after ${timeoutMs / 1000}s`);
}

async function waitForCondition<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  description: string,
  timeoutMs = 120_000,
  pollMs = 2_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | null = null;
  while (Date.now() < deadline) {
    lastValue = await read();
    if (predicate(lastValue)) return lastValue;
    await sleep(pollMs);
  }

  throw new Error(`Condition timed out after ${timeoutMs}ms: ${description}; last value: ${String(lastValue)}`);
}

function decodeLittleEndianBigInt(base64Value: string): bigint {
  const bytes = Buffer.from(base64Value, "base64");
  if (bytes.length === 0) return 0n;

  let result = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) + BigInt(bytes[index]);
  }
  return result;
}

function readIntegerStack(result: unknown): bigint {
  const stackItem = (
    result as { stack?: Array<{ type?: string; value?: string | number }> }
  )?.stack?.[0];
  const stackValue = stackItem?.value;
  if (typeof stackValue === "string" && stackValue.length > 0) {
    if (/^-?\d+$/.test(stackValue)) return BigInt(stackValue);
    return decodeLittleEndianBigInt(stackValue);
  }
  if (typeof stackValue === "number") return BigInt(stackValue);
  return 0n;
}

function addressToScriptHash(address: string): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return address.toLowerCase();
  let n = 0n;
  for (const ch of address) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const hashBytes = bytes.slice(1, 21).reverse();
  return `0x${hashBytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function readNep17Balance(assetHash: string, address: string): Promise<bigint> {
  const result = await rpcCall("invokefunction", [
    assetHash,
    "balanceOf",
    [{ type: "Hash160", value: addressToScriptHash(address) }],
    [],
  ]);
  return readIntegerStack(result);
}

function createCommunityToken(factoryHash: string, symbol: string): string {
  const output = runFixture([
    "create-token",
    factoryHash,
    `FEAT-075 ${symbol}`,
    symbol,
    "1000000",
    "0",
    "0",
  ]);
  return parseFixtureValue(output, "TOKEN_HASH");
}

function activateSpeculationMarket(
  factoryHash: string,
  tokenHash: string,
  curveInventory = "700000"
): void {
  runFixture([
    "change-mode",
    factoryHash,
    tokenHash,
    "speculation",
    "GAS",
    curveInventory,
  ]);
}

test.describe("FEAT-075 markets trading integration", () => {
  let profileCopyDir: string | undefined;
  let context: BrowserContext | undefined;
  let page: Page;
  let factoryHash: string;
  let routerHash: string;

  test.beforeAll(() => {
    if (NEOLINE_PASSWORD === undefined) {
      throw new Error(
        "NEOLINE_PASSWORD env var is not set.\n" +
          "Add it to e2e/integration/.env.integration or export it before running integration tests."
      );
    }
  });

  test.beforeEach(async () => {
    resetChain();
    await waitForChain();
    await waitForFunding(CLIENT1_ADDRESS);

    factoryHash = deployFactoryAndParseHash();
    const routerOutput = runFixture(["deploy-router", factoryHash]);
    routerHash = parseFixtureValue(routerOutput, "ROUTER_HASH");

    profileCopyDir = createProfileCopy();
    ({ context, page } = await launchWithNeoLine(profileCopyDir));

    await context.addInitScript(
      ({ factoryStorageKey, routerStorageKey, nextFactoryHash, nextRouterHash }) => {
        window.localStorage.setItem(factoryStorageKey, nextFactoryHash);
        window.localStorage.setItem(routerStorageKey, nextRouterHash);
      },
      {
        factoryStorageKey: FACTORY_HASH_STORAGE_KEY,
        routerStorageKey: ROUTER_HASH_STORAGE_KEY,
        nextFactoryHash: factoryHash,
        nextRouterHash: routerHash,
      }
    );

    await warmupRoutes(context);
  });

  test.afterEach(async () => {
    await context?.close().catch(() => {});
    if (profileCopyDir) {
      removeProfileCopy(profileCopyDir);
    }
  });

  test("public /markets discovery opens a live pair and stays on the market route through a buy", async () => {
    const symbol = "MRK75";
    const tokenHash = createCommunityToken(factoryHash, symbol);
    activateSpeculationMarket(factoryHash, tokenHash);

    const balanceBeforeBuy = await readNep17Balance(tokenHash, CLIENT1_ADDRESS);

    await gotoWithRetry(page, `${BASE_URL}/markets`);
    await expect(page.getByText("Public markets")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Pairs" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    await expect(
      page.getByRole("link", { name: new RegExp(`^${symbol}/GAS\\b`) }).first()
    ).toBeVisible({ timeout: 30_000 });

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 900, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole("searchbox", { name: "Search markets" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Pairs" })).toBeVisible();
      await expect(
        page.getByRole("link", { name: new RegExp(`^${symbol}/GAS\\b`) }).first()
      ).toBeVisible({ timeout: 30_000 });
    }

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("link", { name: `Open ${symbol}/GAS` }).click();
    await page.waitForURL(new RegExp(`/markets/${tokenHash}$`), { timeout: 60_000 });

    await expect(page.getByText(`${symbol}/GAS`)).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText("Available after indexer deployment")
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Buy / Sell")).toBeVisible({ timeout: 30_000 });

    await connectWalletFromCurrentPage(page, context!);
    await page.getByRole("button", { name: "0.1 GAS" }).click();
    const impactCheckbox = page.getByLabel(
      "I understand this trade has more than 15% price impact."
    );
    if (await impactCheckbox.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await impactCheckbox.check();
    }
    await expect(
      page.getByRole("button", { name: `Buy ${symbol}` })
    ).toBeEnabled({ timeout: 30_000 });

    await signInNeoLine(context!, async () => {
      await page.getByRole("button", { name: `Buy ${symbol}` }).click();
    });

    const txid = await waitForPendingTxHash(
      page,
      `Waiting for ${symbol}/GAS buy confirmation...`
    );
    await waitForTx(txid);
    await page
      .getByRole("status", { name: "Pending transaction status" })
      .waitFor({ state: "hidden", timeout: 120_000 })
      .catch(() => {});

    await waitForCondition(
      () => readNep17Balance(tokenHash, CLIENT1_ADDRESS),
      (value) => value > balanceBeforeBuy,
      "buyer token balance to increase after bonding-curve buy"
    );

    await expect(page).toHaveURL(new RegExp(`/markets/${tokenHash}$`));
  });

  test("creator speculation activation redirects from /tokens/:hash into /markets/:hash with a launch banner", async () => {
    const symbol = "HND75";
    const tokenHash = createCommunityToken(factoryHash, symbol);

    await gotoWithRetry(page, `${BASE_URL}/tokens/${tokenHash}`);
    await connectWalletFromCurrentPage(page, context!);
    await page.reload({ waitUntil: "networkidle" });
    await dismissAdminHintIfPresent(page);

    await expect(page.getByText("TOKEN ADMINISTRATION")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Properties" }).click();
    await page.getByLabel("Mode selector").selectOption("speculative");
    await page.getByRole("button", { name: "Review Launch" }).click();

    await expect(
      page.getByRole("dialog", { name: "Speculation activation review" })
    ).toBeVisible({ timeout: 30_000 });
    const reviewDialog = page.getByRole("dialog", {
      name: "Speculation activation review",
    });
    await expect(reviewDialog.getByText("TokenFactory update fee", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(reviewDialog.getByText("Estimated chain fee", { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      reviewDialog.getByText("Estimated total wallet outflow", { exact: true })
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(reviewDialog.getByText(`${symbol}/GAS`, { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    const activateButton = page.getByRole("button", {
      name: "Activate Speculation Market",
    });
    await expect(activateButton).toBeEnabled({ timeout: 30_000 });

    await signInNeoLine(context!, async () => {
      await activateButton.click();
    });

    await page.waitForURL(new RegExp(`/markets/${tokenHash}$`), {
      timeout: 120_000,
    });
    await expect(page.getByText("Speculation Market Is Live")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(`${symbol}/GAS created`)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Share Pair" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Buy / Sell")).toBeVisible({ timeout: 30_000 });
  });
});
