import { test, expect, chromium } from "@playwright/test";
import type { BrowserContext, Page } from "@playwright/test";
import { execFileSync, execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
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
const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";
const NEOLINE_PASSWORD: string | undefined = process.env.NEOLINE_PASSWORD;
const TEMPLATE_NEF_PATH = path.resolve(
  FORGE_ROOT_DIR,
  "public/contracts/TokenTemplate.nef"
);
const TEMPLATE_MANIFEST_PATH = path.resolve(
  FORGE_ROOT_DIR,
  "public/contracts/TokenTemplate.manifest.json"
);

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
      const res = await fetch(NEO_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getblockcount",
          params: [],
        }),
        signal: AbortSignal.timeout(3_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { result?: number };
        if (typeof json.result === "number" && json.result >= 1) return;
      }
    } catch {
      // wait for RPC
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
      const res = await fetch(NEO_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getnep17balances",
          params: [address],
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          result?: { balance?: unknown[] };
        };
        if ((json.result?.balance ?? []).length >= 2) return;
      }
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

function runGovernanceFixture(args: string[]): void {
  execFileSync("node", ["scripts/factory-governance-fixtures.cjs", ...args], {
    cwd: FORGE_ROOT_DIR,
    stdio: "inherit",
  });
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
    .getByRole("button", { name: /Connect|Allow|Confirm|Sign|Send|Approve|Yes|确认/i })
    .first();

  await expect(confirmBtn).toBeVisible({ timeout: 20_000 });
  await signExistingNeoLinePopup(popup);
}

async function warmupRoutes(context: BrowserContext): Promise<void> {
  const warmTargets = [
    `${BASE_URL}/tokens/0x0000000000000000000000000000000000000000`,
    `${BASE_URL}/admin/factory`,
  ];

  for (const target of warmTargets) {
    const warmup = await context.newPage();
    await warmup.goto(target, { waitUntil: "load", timeout: 60_000 }).catch(() => {});
    await warmup.waitForTimeout(2_000);
    await warmup.close();
  }
}

async function connectWalletOnTokensPage(
  page: Page,
  context: BrowserContext
): Promise<void> {
  await page.goto(`${BASE_URL}/tokens`);
  await page.waitForLoadState("networkidle");

  const alreadyConnected = await page.evaluate(
    (prefix: string) => document.body.textContent?.includes(prefix) ?? false,
    CLIENT1_ADDRESS.slice(0, 6)
  );
  if (alreadyConnected) {
    return;
  }

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

async function ensureFactoryHashOnActivePage(
  page: Page,
  context: BrowserContext,
  factoryHash: string
): Promise<void> {
  await page.evaluate(
    ({ storageKey, hash }) => {
      window.localStorage.setItem(storageKey, hash);
    },
    { storageKey: FACTORY_HASH_STORAGE_KEY, hash: factoryHash }
  );
  await page.reload({ waitUntil: "networkidle" });
  await connectWalletOnTokensPage(page, context);
}

async function openAdminPage(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/factory`);
  await expect(page.getByRole("heading", { name: "Factory Admin" })).toBeVisible({
    timeout: 30_000,
  });
}

async function deployFactoryThroughUi(
  page: Page,
  context: BrowserContext
): Promise<void> {
  await expect(
    page.getByRole("button", { name: "Deploy TokenFactory" })
  ).toBeVisible({ timeout: 30_000 });

  await signInNeoLine(context, async () => {
    await page.getByRole("button", { name: "Deploy TokenFactory" }).click();
  });

  await expect(
    page.getByText(/Initializing TokenFactory with TokenTemplate/i)
  ).toBeVisible({ timeout: 120_000 });

  const existingPopup = context
    .pages()
    .find(
      (candidate) =>
        candidate !== page &&
        !candidate.isClosed() &&
        candidate.url().startsWith(`chrome-extension://${NEOLINE_ID}/`)
    );

  const initPopup =
    existingPopup ??
    (await context.waitForEvent("page", { timeout: 120_000 }));
  await signExistingNeoLinePopup(initPopup);

  await expect(
    page.getByRole("button", { name: "Deploy TokenFactory" })
  ).toHaveCount(0, { timeout: 120_000 });
}

async function readSummaryValue(page: Page, label: string): Promise<string> {
  const value = await page.evaluate((requestedLabel) => {
    const dts = Array.from(document.querySelectorAll("dt"));
    const dt = dts.find(
      (item) => item.textContent?.trim().toLowerCase() === requestedLabel.toLowerCase()
    );
    return dt?.nextElementSibling?.textContent?.trim() ?? null;
  }, label);

  if (!value) {
    throw new Error(`Summary value not found for label: ${label}`);
  }

  return value;
}

function createUpgradeManifest(): { dir: string; manifestPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "feat-079-template-"));
  const manifest = JSON.parse(fs.readFileSync(TEMPLATE_MANIFEST_PATH, "utf8")) as {
    extra?: Record<string, unknown>;
  };
  manifest.extra = {
    ...(manifest.extra ?? {}),
    Version: "1.0.0-e2e",
    E2ERevision: `feat-079-${Date.now()}`,
  };
  const manifestPath = path.join(tmpDir, "TokenTemplate.e2e.manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  return { dir: tmpDir, manifestPath };
}

test.describe("FEAT-079 Factory Governance Integration", () => {
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

    factoryHash = deployFactoryAndParseHash();
    profileCopyDir = createProfileCopy();
    ({ context, page } = await launchWithNeoLine(profileCopyDir));

    await context.addInitScript(
      ({ storageKey, hash }) => {
        window.localStorage.setItem(storageKey, hash);
      },
      { storageKey: FACTORY_HASH_STORAGE_KEY, hash: factoryHash }
    );

    await warmupRoutes(context);
  });

  test.afterEach(async () => {
    await context.close().catch(() => {});
    removeProfileCopy(profileCopyDir);
  });

  test("owner sees admin link and can update the creation fee", async () => {
    await connectWalletOnTokensPage(page, context);
    await ensureFactoryHashOnActivePage(page, context, factoryHash);
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible({
      timeout: 30_000,
    });

    await openAdminPage(page);
    await expect
      .poll(async () => readSummaryValue(page, "Creation Fee"), {
        timeout: 30_000,
      })
      .toBe("15 GAS");
    await expect
      .poll(async () => readSummaryValue(page, "Template Version"), {
        timeout: 30_000,
      })
      .toBe("v1");

    await page.getByLabel("Creation fee GAS input").fill("16.25");
    await signInNeoLine(context, async () => {
      await page.getByRole("button", { name: "Set Creation Fee" }).click();
    });

    await expect(
      page.getByRole("status").filter({ hasText: "Admin Action Confirmed" })
    ).toBeVisible({ timeout: 120_000 });
    await expect
      .poll(async () => readSummaryValue(page, "Creation Fee"), {
        timeout: 120_000,
      })
      .toBe("16.25 GAS");
  });

  test("non-owner wallet is denied after ownership changes on-chain", async () => {
    await connectWalletOnTokensPage(page, context);
    await ensureFactoryHashOnActivePage(page, context, factoryHash);
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible({
      timeout: 30_000,
    });

    runGovernanceFixture(["set-owner", factoryHash, CLIENT2_ADDRESS]);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0, {
      timeout: 30_000,
    });

    await page.goto(`${BASE_URL}/admin/factory`);
    await expect(page.getByRole("heading", { name: "Unauthorized" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText(
        "This page is restricted to the TokenFactory contract owner. Connect the owner wallet to continue."
      )
    ).toBeVisible();
  });

  test("owner can claim partial and full GAS balances from the factory", async () => {
    runGovernanceFixture(["fund-factory", factoryHash, "250000000"]);

    await connectWalletOnTokensPage(page, context);
    await ensureFactoryHashOnActivePage(page, context, factoryHash);
    await openAdminPage(page);

    const gasRow = page.locator("tbody tr").filter({ hasText: GAS_HASH });
    await expect(gasRow).toContainText("GAS", { timeout: 30_000 });
    await expect(gasRow).toContainText("2.50000000");

    await gasRow.getByLabel(`Partial amount for ${GAS_HASH}`).fill("1");
    await signInNeoLine(context, async () => {
      await gasRow.getByRole("button", { name: "Claim Partial" }).click();
    });

    await expect
      .poll(async () => gasRow.textContent(), { timeout: 120_000 })
      .toContain("1.50000000");

    await signInNeoLine(context, async () => {
      await gasRow.getByRole("button", { name: "Claim All" }).click();
    });

    await expect(
      page.getByText("No claimable assets were found for the factory.")
    ).toBeVisible({ timeout: 120_000 });
  });

  test("owner can upgrade the template and the version increments", async () => {
    await connectWalletOnTokensPage(page, context);
    await ensureFactoryHashOnActivePage(page, context, factoryHash);
    await openAdminPage(page);

    const initialTemplateHash = await readSummaryValue(page, "Template Hash");
    await expect
      .poll(async () => readSummaryValue(page, "Template Version"), {
        timeout: 30_000,
      })
      .toBe("v1");

    const { dir, manifestPath } = createUpgradeManifest();
    try {
      await page.getByLabel("Template NEF file").setInputFiles(TEMPLATE_NEF_PATH);
      await page.getByLabel("Template manifest file").setInputFiles(manifestPath);

      await page.getByRole("button", { name: "Upgrade Template" }).click();
      await expect(page.getByRole("dialog", { name: "Confirm Action" })).toBeVisible();
      await expect(
        page.getByText(
          "This upgrade affects only future token deployments. Existing deployed tokens are unchanged."
        )
      ).toBeVisible();

      await signInNeoLine(context, async () => {
        await page.getByRole("button", { name: "Confirm", exact: true }).click();
      });

      await expect
        .poll(async () => readSummaryValue(page, "Template Version"), {
          timeout: 120_000,
        })
        .toBe("v2");
      await expect
        .poll(async () => readSummaryValue(page, "Template Hash"), {
          timeout: 120_000,
        })
        .not.toBe(initialTemplateHash);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

test.describe("FEAT-079 Factory Deployment Reactivity", () => {
  let profileCopyDir: string;
  let context: BrowserContext;
  let page: Page;

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

    profileCopyDir = createProfileCopy();
    ({ context, page } = await launchWithNeoLine(profileCopyDir));
  });

  test.afterEach(async () => {
    await context.close().catch(() => {});
    removeProfileCopy(profileCopyDir);
  });

  test("deploying from the tokens page reveals Admin without a browser refresh", async () => {
    await connectWalletOnTokensPage(page, context);

    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await deployFactoryThroughUi(page, context);

    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByRole("button", { name: "Forge Token" })).toBeEnabled();
  });
});
