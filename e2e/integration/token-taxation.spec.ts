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
const CLIENT1_ADDRESS = "NV1Q1dTdvzPbThPbSFz7zudTmsmgnCwX6c";
const CLIENT2_ADDRESS = "NhJX9eCbkKtgDrh1S4xMTRaHUGbZ5Be7uU";
const CLIENT2_WIF = "L1RgqMJEBjdXcuYCMYB6m7viQ9zjkNPjZPAKhhBoXxEsygNXENBb";
const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";
const NEOLINE_PASSWORD: string | undefined = process.env.NEOLINE_PASSWORD;
const TAXED_TRANSFER_AMOUNT = 10_000n;
const ZERO_CONFIG_TRANSFER_AMOUNT = 1_000n;
const BURN_AMOUNT = 1_234n;

declare global {
  interface Window {
    __feat093TransferPromise?: Promise<{ txid: string }>;
  }
}

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

async function waitForChain(timeoutMs = 90_000, pollMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await rpcCall("getblockcount", []);
      if (typeof result === "number" && result >= 1) return;
    } catch {
      // wait for chain RPC
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

function runFixture(
  args: string[],
  envOverrides: Record<string, string> = {}
): string {
  return execFileSync("node", ["scripts/factory-governance-fixtures.cjs", ...args], {
    cwd: FORGE_ROOT_DIR,
    env: { ...process.env, ...envOverrides },
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

  const pwInput = neoLinePage.locator('input[type="password"]');
  if (await pwInput.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await pwInput.click();
    await neoLinePage.keyboard.type(NEOLINE_PASSWORD ?? "");
    await neoLinePage.keyboard.press("Enter");
    await pwInput.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  }

  await neoLinePage.close();
  const page = await context.newPage();
  return { context, page };
}

async function signExistingNeoLinePopup(popup: Page): Promise<void> {
  await popup.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => {});
  await popup.locator(".loading-box").waitFor({ state: "hidden", timeout: 60_000 }).catch(() => {});
  await popup
    .waitForFunction(() => {
      const btn = document.querySelector("button.confirm:not(.pop-ups)");
      return btn !== null && !btn.classList.contains("disabled");
    }, { timeout: 30_000 })
    .catch(() => {});

  await popup.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>("button.confirm"));
    const btn = btns.find((item) => !item.classList.contains("pop-ups")) ?? btns[0];
    btn?.click();
  });

  await popup
    .waitForFunction(() => document.querySelector("button.confirm.pop-ups") !== null, {
      timeout: 30_000,
    })
    .catch(() => {});

  if (!popup.isClosed()) {
    await popup
      .evaluate(() => {
        document.querySelector<HTMLButtonElement>("button.confirm.pop-ups")?.click();
      })
      .catch(() => {});
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

  const pwInput = popup.locator('input[type="password"]');
  if (await pwInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await pwInput.click();
    await popup.keyboard.type(NEOLINE_PASSWORD ?? "");
    await popup.keyboard.press("Enter");
    await pwInput.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    await popup.waitForTimeout(2_000);
  }

  const confirmBtn = popup
    .getByRole("button", { name: /Connect|Allow|Confirm|Sign|Send|Approve|Yes|ç¡®è®¤/i })
    .first();

  await expect(confirmBtn).toBeVisible({ timeout: 20_000 });
  await signExistingNeoLinePopup(popup);
}

async function connectWalletOnTokensPage(
  page: Page,
  context: BrowserContext
): Promise<void> {
  await gotoWithRetry(page, `${BASE_URL}/tokens`);

  const alreadyConnected = await page.evaluate(
    (prefix: string) => document.body.textContent?.includes(prefix) ?? false,
    CLIENT1_ADDRESS.slice(0, 6)
  );
  if (alreadyConnected) return;

  await signInNeoLine(
    context,
    async () => {
      await page.getByRole("button", { name: /Connect Wallet/i }).first().click();
      const neoLineBtn = page.getByRole("button", { name: /NeoLine/i }).first();
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
    await sleep(3000);
  }
  throw new Error(`Transaction ${txid} not confirmed after ${timeoutMs / 1000}s`);
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function addressToScriptHash(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return address.toLowerCase();
  let n = 0n;
  for (const ch of address) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid Base58 character: ${ch}`);
    n = n * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  for (let i = 0; i < 25; i++) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  const hashBytes = bytes.slice(1, 21).reverse();
  return `0x${hashBytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
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

async function readNep17Balance(assetHash: string, address: string): Promise<bigint> {
  const result = await rpcCall("invokefunction", [
    assetHash,
    "balanceOf",
    [{ type: "Hash160", value: addressToScriptHash(address) }],
    [],
  ]);
  return readIntegerStack(result);
}

async function readTotalSupply(tokenHash: string): Promise<bigint> {
  const result = await rpcCall("invokefunction", [tokenHash, "totalSupply", [], []]);
  return readIntegerStack(result);
}

async function readClaimableCreatorFee(tokenHash: string): Promise<bigint> {
  const result = await rpcCall("invokefunction", [
    tokenHash,
    "getClaimableCreatorFee",
    [],
    [],
  ]);
  return readIntegerStack(result);
}

async function invokeTokenTransfer(
  page: Page,
  context: BrowserContext,
  tokenHash: string,
  recipientAddress: string,
  amount: bigint
): Promise<string> {
  const fromHash = addressToScriptHash(CLIENT1_ADDRESS);
  const toHash = addressToScriptHash(recipientAddress);

  await signInNeoLine(context, async () => {
    await page.evaluate(
      ({ scriptHash, from, to, rawAmount }) => {
        const walletWindow = window as Window & {
          NEOLine?: { Neo: new () => { invoke(params: unknown): Promise<{ txid: string }> } };
          NEOLineN3?: {
            Init?: new () => { invoke(params: unknown): Promise<{ txid: string }> };
            Neo?: new () => { invoke(params: unknown): Promise<{ txid: string }> };
          };
        };
        const DapiCtor =
          walletWindow.NEOLineN3?.Init ??
          walletWindow.NEOLineN3?.Neo ??
          walletWindow.NEOLine?.Neo;
        if (!DapiCtor) {
          throw new Error("NeoLine dAPI is unavailable on the page");
        }
        const dapi = new DapiCtor();
        window.__feat093TransferPromise = dapi.invoke({
          scriptHash,
          operation: "transfer",
          args: [
            { type: "Hash160", value: from },
            { type: "Hash160", value: to },
            { type: "Integer", value: rawAmount },
            { type: "Any", value: null },
          ],
          signers: [{ account: from, scopes: "Global" }],
          description: `FEAT-093 transfer ${rawAmount} raw units`,
        });
      },
      {
        scriptHash: tokenHash,
        from: fromHash,
        to: toHash,
        rawAmount: amount.toString(),
      }
    );
  });

  const txid = await page.evaluate(async () => {
    const result = await window.__feat093TransferPromise;
    delete window.__feat093TransferPromise;
    return result?.txid ?? null;
  });

  if (!txid) {
    throw new Error("NeoLine did not return a transaction hash for the transfer");
  }
  return txid;
}

async function selectWalletToken(page: Page, symbol: string): Promise<void> {
  const currentSymbol = page.getByTestId("wallet-panel-current-symbol");
  for (let step = 0; step < 6; step += 1) {
    const currentText = (await currentSymbol.textContent().catch(() => null))?.trim();
    if (currentText === symbol) {
      return;
    }
    const nextButton = page.getByLabel("Next token");
    const nextVisible = await nextButton.isVisible({ timeout: 1_000 }).catch(() => false);
    if (!nextVisible || (await nextButton.isDisabled())) {
      break;
    }
    await nextButton.click();
    await page.waitForTimeout(300);
  }

  await expect(currentSymbol).toHaveText(symbol, { timeout: 10_000 });
}

function extractTxHashFromNeoTubeHref(href: string | null): string {
  if (!href) {
    throw new Error("Pending NeoTube transaction link was not available");
  }
  const match = href.match(/\/transaction\/(0x[0-9a-fA-F]{64})$/);
  if (!match) {
    throw new Error(`Could not parse tx hash from href: ${href}`);
  }
  return match[1].toLowerCase();
}

function createToken(
  factoryHash: string,
  symbol: string,
  creatorFeeRate: number,
  envOverrides: Record<string, string> = {}
): string {
  const output = runFixture(
    [
      "create-token",
      factoryHash,
      `FEAT-093 ${symbol}`,
      symbol,
      "0",
      "0",
      String(creatorFeeRate),
    ],
    envOverrides
  );
  return parseFixtureValue(output, "TOKEN_HASH");
}

function createTokenViaClient2(
  factoryHash: string,
  symbol: string,
  creatorFeeRate: number
): string {
  return createToken(factoryHash, symbol, creatorFeeRate, {
    E2E_TEST_ACCOUNT_WIF: CLIENT2_WIF,
  });
}

function createTokenViaClient1(
  factoryHash: string,
  symbol: string,
  creatorFeeRate: number
): string {
  return createToken(factoryHash, symbol, creatorFeeRate);
}

function mintTokensWithSigner(
  factoryHash: string,
  tokenHash: string,
  recipient: string,
  amount: bigint,
  envOverrides: Record<string, string> = {}
): void {
  runFixture(
    ["mint-tokens", factoryHash, tokenHash, recipient, amount.toString()],
    envOverrides
  );
}

function mintHolderBalance(factoryHash: string, tokenHash: string, amount: bigint): void {
  mintTokensWithSigner(factoryHash, tokenHash, CLIENT1_ADDRESS, amount, {
    E2E_TEST_ACCOUNT_WIF: CLIENT2_WIF,
  });
}

function transferTokenWithSigner(
  tokenHash: string,
  recipient: string,
  amount: bigint,
  envOverrides: Record<string, string> = {}
): void {
  runFixture(["transfer-token", tokenHash, recipient, amount.toString()], envOverrides);
}

async function openTokenDetailPage(page: Page, tokenHash: string): Promise<void> {
  await gotoWithRetry(page, `${BASE_URL}/tokens/${tokenHash}`);
  await dismissAdminHintIfPresent(page);
}

async function dismissAdminHintIfPresent(page: Page): Promise<void> {
  const overlay = page.getByTestId("admin-update-hint-overlay");
  if (await overlay.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await overlay.getByRole("button", { name: "OK" }).click();
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
  const txHref = await pendingToast
    .getByRole("link", { name: /Track transaction on NeoTube/i })
    .getAttribute("href");
  return extractTxHashFromNeoTubeHref(txHref);
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

test.describe("FEAT-093 Token Taxation Integration", () => {
  let profileCopyDir: string;
  let context: BrowserContext;
  let page: Page;
  let factoryHash: string;

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
    await waitForFunding(CLIENT2_ADDRESS);

    factoryHash = deployFactoryAndParseHash();
    profileCopyDir = createProfileCopy();
    ({ context, page } = await launchWithNeoLine(profileCopyDir));
    await context.addInitScript(
      ({ storageKey, hash }) => {
        window.localStorage.setItem(storageKey, hash);
      },
      { storageKey: FACTORY_HASH_STORAGE_KEY, hash: factoryHash }
    );
  });

  test.afterEach(async () => {
    await context.close().catch(() => {});
    removeProfileCopy(profileCopyDir);
  });

  test("NeoLine holder transfer applies burn, creator fee, and platform fee", async () => {
    const tokenHash = createTokenViaClient2(factoryHash, "TX93A", 500_000);
    runFixture(["set-platform-fee", factoryHash, "1000000"]);
    runFixture(["set-burn-rate", factoryHash, tokenHash, "200"], {
      E2E_TEST_ACCOUNT_WIF: CLIENT2_WIF,
    });
    mintHolderBalance(factoryHash, tokenHash, 100_000n);

    await connectWalletOnTokensPage(page, context);

    const recipientBefore = await readNep17Balance(tokenHash, CLIENT2_ADDRESS);
    const tokenGasBefore = await readNep17Balance(GAS_HASH, tokenHash);
    const claimableCreatorFeeBefore = await readClaimableCreatorFee(tokenHash);
    const creatorGasBefore = await readNep17Balance(GAS_HASH, CLIENT2_ADDRESS);
    const factoryGasBefore = await readNep17Balance(GAS_HASH, factoryHash);
    const supplyBefore = await readTotalSupply(tokenHash);

    const txid = await invokeTokenTransfer(
      page,
      context,
      tokenHash,
      CLIENT2_ADDRESS,
      TAXED_TRANSFER_AMOUNT
    );
    await waitForTx(txid);

    const recipientAfter = await readNep17Balance(tokenHash, CLIENT2_ADDRESS);
    const tokenGasAfter = await readNep17Balance(GAS_HASH, tokenHash);
    const claimableCreatorFeeAfter = await readClaimableCreatorFee(tokenHash);
    const creatorGasAfter = await readNep17Balance(GAS_HASH, CLIENT2_ADDRESS);
    const factoryGasAfter = await readNep17Balance(GAS_HASH, factoryHash);
    const supplyAfter = await readTotalSupply(tokenHash);

    expect(recipientAfter - recipientBefore).toBe(9_800n);
    expect(tokenGasAfter - tokenGasBefore).toBe(500_000n);
    expect(claimableCreatorFeeAfter - claimableCreatorFeeBefore).toBe(500_000n);
    expect(creatorGasAfter - creatorGasBefore).toBe(0n);
    expect(factoryGasAfter - factoryGasBefore).toBe(1_000_000n);
    expect(supplyBefore - supplyAfter).toBe(200n);
  });

  test("NeoLine zero-config transfer applies no token taxes", async () => {
    const tokenHash = createTokenViaClient2(factoryHash, "TX93Z", 0);
    mintHolderBalance(factoryHash, tokenHash, 100_000n);

    await connectWalletOnTokensPage(page, context);

    const recipientBefore = await readNep17Balance(tokenHash, CLIENT2_ADDRESS);
    const tokenGasBefore = await readNep17Balance(GAS_HASH, tokenHash);
    const claimableCreatorFeeBefore = await readClaimableCreatorFee(tokenHash);
    const creatorGasBefore = await readNep17Balance(GAS_HASH, CLIENT2_ADDRESS);
    const factoryGasBefore = await readNep17Balance(GAS_HASH, factoryHash);
    const supplyBefore = await readTotalSupply(tokenHash);

    const txid = await invokeTokenTransfer(
      page,
      context,
      tokenHash,
      CLIENT2_ADDRESS,
      ZERO_CONFIG_TRANSFER_AMOUNT
    );
    await waitForTx(txid);

    const recipientAfter = await readNep17Balance(tokenHash, CLIENT2_ADDRESS);
    const tokenGasAfter = await readNep17Balance(GAS_HASH, tokenHash);
    const claimableCreatorFeeAfter = await readClaimableCreatorFee(tokenHash);
    const creatorGasAfter = await readNep17Balance(GAS_HASH, CLIENT2_ADDRESS);
    const factoryGasAfter = await readNep17Balance(GAS_HASH, factoryHash);
    const supplyAfter = await readTotalSupply(tokenHash);

    expect(recipientAfter - recipientBefore).toBe(1_000n);
    expect(tokenGasAfter - tokenGasBefore).toBe(0n);
    expect(claimableCreatorFeeAfter - claimableCreatorFeeBefore).toBe(0n);
    expect(creatorGasAfter - creatorGasBefore).toBe(0n);
    expect(factoryGasAfter - factoryGasBefore).toBe(0n);
    expect(supplyAfter - supplyBefore).toBe(0n);
  });

  test("NeoLine holder burn opens from the wallet strip and shows the tax summary", async () => {
    const tokenHash = createTokenViaClient2(factoryHash, "BRN93", 500_000);
    runFixture(["set-platform-fee", factoryHash, "1000000"]);
    mintHolderBalance(factoryHash, tokenHash, 100_000n);

    await connectWalletOnTokensPage(page, context);
    await selectWalletToken(page, "BRN93");
    await expect(page.getByTestId("wallet-panel-burn-action")).toBeVisible({
      timeout: 10_000,
    });

    const holderBefore = await readNep17Balance(tokenHash, CLIENT1_ADDRESS);
    const tokenGasBefore = await readNep17Balance(GAS_HASH, tokenHash);
    const claimableCreatorFeeBefore = await readClaimableCreatorFee(tokenHash);
    const creatorGasBefore = await readNep17Balance(GAS_HASH, CLIENT2_ADDRESS);
    const factoryGasBefore = await readNep17Balance(GAS_HASH, factoryHash);
    const supplyBefore = await readTotalSupply(tokenHash);

    await page.getByTestId("wallet-panel-burn-action").click();
    const dialog = page.getByRole("dialog", { name: "Burn BRN93" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByLabel("Burn economics summary")).toContainText(
      "Creator fee"
    );
    await expect(dialog).toContainText("0.005 GAS");
    await expect(dialog).toContainText("Platform fee");
    await expect(dialog).toContainText("0.01 GAS");
    await expect(dialog).toContainText(
      "Neo network GAS fees are charged separately and may be shown differently by your wallet. They are not part of token taxes."
    );

    await dialog.getByLabel("Amount to burn").fill(BURN_AMOUNT.toString());

    await signInNeoLine(context, async () => {
      await dialog.getByRole("button", { name: "Burn", exact: true }).click();
    });

    const txid = await waitForPendingTxHash(
      page,
      "Waiting for BRN93 burn confirmation..."
    );
    await waitForTx(txid);

    const holderAfter = await readNep17Balance(tokenHash, CLIENT1_ADDRESS);
    const tokenGasAfter = await readNep17Balance(GAS_HASH, tokenHash);
    const claimableCreatorFeeAfter = await readClaimableCreatorFee(tokenHash);
    const creatorGasAfter = await readNep17Balance(GAS_HASH, CLIENT2_ADDRESS);
    const factoryGasAfter = await readNep17Balance(GAS_HASH, factoryHash);
    const supplyAfter = await readTotalSupply(tokenHash);

    expect(holderBefore - holderAfter).toBe(BURN_AMOUNT);
    expect(tokenGasAfter - tokenGasBefore).toBe(500_000n);
    expect(claimableCreatorFeeAfter - claimableCreatorFeeBefore).toBe(500_000n);
    expect(creatorGasAfter - creatorGasBefore).toBe(0n);
    expect(factoryGasAfter - factoryGasBefore).toBe(1_000_000n);
    expect(supplyBefore - supplyAfter).toBe(BURN_AMOUNT);
  });

  test("NeoLine creator can partially and fully claim accrued creator fees from the token", async () => {
    const tokenHash = createTokenViaClient1(factoryHash, "CLM93", 500_000);
    mintTokensWithSigner(factoryHash, tokenHash, CLIENT2_ADDRESS, 100_000n);
    transferTokenWithSigner(tokenHash, CLIENT1_ADDRESS, TAXED_TRANSFER_AMOUNT, {
      E2E_TEST_ACCOUNT_WIF: CLIENT2_WIF,
    });

    expect(await readClaimableCreatorFee(tokenHash)).toBe(500_000n);
    expect(await readNep17Balance(GAS_HASH, tokenHash)).toBe(500_000n);

    await connectWalletOnTokensPage(page, context);
    await openTokenDetailPage(page, tokenHash);
    const creatorClaimSection = page.locator("section").filter({
      hasText: "CREATOR FEE CLAIMS",
    }).first();

    await expect(creatorClaimSection).toBeVisible({
      timeout: 10_000,
    });
    await expect(creatorClaimSection.getByText("0.005 GAS")).toBeVisible();

    await page.getByLabel("Creator fee claim GAS input").fill("0.002");
    await signInNeoLine(context, async () => {
      await page.getByRole("button", { name: "Claim Partial" }).click();
    });

    const partialClaimTxid = await waitForPendingTxHash(
      page,
      "Claiming creator fees for CLM93..."
    );
    await waitForTx(partialClaimTxid);

    expect(await readClaimableCreatorFee(tokenHash)).toBe(300_000n);
    expect(await readNep17Balance(GAS_HASH, tokenHash)).toBe(300_000n);

    await connectWalletOnTokensPage(page, context);
    await openTokenDetailPage(page, tokenHash);
    await expect(
      page.locator("section").filter({ hasText: "CREATOR FEE CLAIMS" }).first().getByText("0.003 GAS")
    ).toBeVisible();

    await signInNeoLine(context, async () => {
      await page.getByRole("button", { name: "Claim All" }).click();
    });

    const claimAllTxid = await waitForPendingTxHash(
      page,
      "Claiming creator fees for CLM93..."
    );
    await waitForTx(claimAllTxid);

    expect(await readClaimableCreatorFee(tokenHash)).toBe(0n);
    expect(await readNep17Balance(GAS_HASH, tokenHash)).toBe(0n);

    await connectWalletOnTokensPage(page, context);
    await openTokenDetailPage(page, tokenHash);
    await expect(
      page.locator("section").filter({ hasText: "CREATOR FEE CLAIMS" }).first().getByText("0 GAS")
    ).toBeVisible();
  });
});
