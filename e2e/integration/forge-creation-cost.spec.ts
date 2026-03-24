import { test, expect, chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { execSync } from "child_process";
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
  await unlockNeoLinePage(neoLinePage);
  await neoLinePage.close();

  const page = await context.newPage();
  return { context, page };
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

test.describe("FEAT-093 Forge creation cost integration", () => {
  let profileCopyDir: string | undefined;
  let context: BrowserContext | undefined;
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
    await context?.close().catch(() => {});
    if (profileCopyDir) {
      removeProfileCopy(profileCopyDir);
    }
  });

  test("Forge overlay quotes TokenFactory fee and total wallet outflow before signing", async () => {
    await connectWalletOnTokensPage(page, context!);

    const forgeButton = page.getByRole("button", { name: "Forge Token" });
    await expect(forgeButton).toBeEnabled({ timeout: 30_000 });
    await forgeButton.click();

    const overlay = page.getByRole("dialog", { name: "Forge a Token" });
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(overlay).toContainText("TokenFactory fee");
    await expect(overlay).toContainText("Estimated chain fee");
    await expect(overlay).toContainText("Estimated total wallet outflow");
    await expect(overlay).toContainText("Fill the required fields");

    await overlay.getByLabel("Token Name").fill("Quote Token");
    await overlay.getByLabel(/^Symbol/).fill("QTAA");
    await overlay.getByLabel("Total Supply").fill("1000000");
    await overlay.getByLabel(/^Decimals/).fill("8");
    await overlay.getByLabel(/Creator Transfer Fee/).fill("0.05");

    await expect(overlay).not.toContainText("Fill the required fields", {
      timeout: 30_000,
    });
    await expect(
      overlay.getByText(/NeoLine confirmation may show only the chain-fee portion/i)
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      overlay.getByText(/Contract invocation FAULT/i)
    ).toHaveCount(0);
    await expect(overlay.getByRole("button", { name: "FORGE" })).toBeEnabled({
      timeout: 20_000,
    });
  });

  test("Forge creation submits one quoted transaction and lands on the created token", async () => {
    await connectWalletOnTokensPage(page, context!);

    await page.getByRole("button", { name: "Forge Token" }).click();
    const overlay = page.getByRole("dialog", { name: "Forge a Token" });
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    const symbol = "QTAB";
    await overlay.getByLabel("Token Name").fill("Quoted Create Token");
    await overlay.getByLabel(/^Symbol/).fill(symbol);
    await overlay.getByLabel("Total Supply").fill("1000000");
    await overlay.getByLabel(/^Decimals/).fill("8");
    await overlay.getByLabel(/Creator Transfer Fee/).fill("0.05");

    await expect(overlay).not.toContainText("Fill the required fields", {
      timeout: 30_000,
    });
    await expect(overlay.getByRole("button", { name: "FORGE" })).toBeEnabled({
      timeout: 20_000,
    });

    await signInNeoLine(context!, async () => {
      await overlay.getByRole("button", { name: "FORGE" }).click();
    });

    const createdTokenCard = page
      .getByRole("article")
      .filter({ hasText: symbol })
      .first();
    await expect(createdTokenCard).toBeVisible({ timeout: 120_000 });
    await expect(createdTokenCard).toContainText("Yours");

    await createdTokenCard.click();
    await page.waitForURL(/\/tokens\/0x[0-9a-fA-F]{40}$/i, { timeout: 60_000 });
    await expect(page.getByText(symbol).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Quoted Create Token").first()).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Creator", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("0.05 GAS")).toBeVisible({ timeout: 30_000 });
  });
});
