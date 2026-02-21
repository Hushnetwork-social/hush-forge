/**
 * e2e/setup-neoline-wallet.ts
 *
 * ONE-TIME SETUP: Creates a fresh NeoLine wallet profile with known credentials
 * suitable for CI/CD integration tests. Does NOT use your personal Edge profile.
 *
 * What this does:
 *   1. Finds the NeoLine extension binary from your Edge installation
 *   2. Launches Edge with a FRESH empty profile + NeoLine loaded explicitly
 *   3. Automates the NeoLine first-time wizard:
 *      a. Imports the containerAccount WIF
 *      b. Sets a known password (NEOLINE_TEST_PASSWORD, default: "HushDev1!")
 *      c. Adds myDevChain custom network (RPC: http://localhost:10332, magic: 5195086)
 *      d. Switches to myDevChain
 *   4. Saves the resulting profile to e2e/wallet-profile/
 *
 * The generated profile:
 *   - Contains NO personal browser data
 *   - Uses the containerAccount wallet (pre-funded in neo3-privatenet-docker)
 *   - Can be committed to the repository (encrypted wallet data only)
 *   - Works in CI/CD — just set NEOLINE_PASSWORD=HushDev1! in env
 *
 * Prerequisites:
 *   - NeoLine installed in Microsoft Edge (so we can copy the extension binary)
 *   - neo3-privatenet-docker running (for the myDevChain network to be reachable)
 *
 * Run from the hush-forge root:
 *   npx ts-node e2e/setup-neoline-wallet.ts
 * OR via npm:
 *   npm run setup:wallet-profile
 */

import { chromium, expect, type Page, type BrowserContext } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Config ────────────────────────────────────────────────────────────────────

const NEOLINE_ID = "cphhlgmgameodnhkjdmkpanlelnlohao";
const NEOLINE_EXT_SRC = path.join(
  process.env.LOCALAPPDATA ?? "C:\\Users\\aboim\\AppData\\Local",
  "Microsoft\\Edge\\User Data\\Default\\Extensions",
  NEOLINE_ID
);

const WALLET_PROFILE_DIR = path.resolve(__dirname, "wallet-profile");
const DEBUG_SCREENSHOTS_DIR = path.resolve(__dirname, "wallet-setup-debug");

// Credentials used by all integration tests — documented, NOT secret for dev.
const TEST_PASSWORD = process.env.NEOLINE_TEST_PASSWORD ?? "HushDev1!";
const CONTAINER_WIF = "L3cNMQUSrvUrHx1MzacwHiUeCWzqK2MLt5fPvJj9mz6L2rzYZpok";
const WALLET_NAME = "containerAccount";

// myDevChain network settings (neo3-privatenet-docker)
const MYDEVCHAIN = {
  name: "myDevChain",
  rpc: "http://localhost:10332",
  magic: "5195086",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let screenshotCounter = 0;

async function snap(page: Page, label: string): Promise<void> {
  fs.mkdirSync(DEBUG_SCREENSHOTS_DIR, { recursive: true });
  const file = path.join(
    DEBUG_SCREENSHOTS_DIR,
    `${String(++screenshotCounter).padStart(2, "0")}-${label}.png`
  );
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  📸 ${file}`);
}

async function waitAndSnap(page: Page, ms: number, label: string): Promise<void> {
  await page.waitForTimeout(ms);
  await snap(page, label);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  NeoLine Wallet Profile Setup");
  console.log("═══════════════════════════════════════════════════════");

  // 1. Find NeoLine extension binary
  if (!fs.existsSync(NEOLINE_EXT_SRC)) {
    throw new Error(
      `NeoLine extension not found at: ${NEOLINE_EXT_SRC}\n` +
        "Please install NeoLine in Microsoft Edge first."
    );
  }
  const versionDirs = fs.readdirSync(NEOLINE_EXT_SRC);
  const neoLineExtDir = path.join(NEOLINE_EXT_SRC, versionDirs[0]);
  console.log(`\nNeoLine extension: ${neoLineExtDir}`);

  // 2. Prepare a fresh profile directory
  const freshProfileDir = path.resolve(__dirname, "wallet-profile-setup-tmp");
  if (fs.existsSync(freshProfileDir)) {
    console.log("Removing previous setup temp profile...");
    fs.rmSync(freshProfileDir, { recursive: true, force: true });
  }
  fs.mkdirSync(freshProfileDir, { recursive: true });

  // 3. Launch Edge with fresh profile + NeoLine
  console.log("\nLaunching Edge with fresh profile + NeoLine...");
  const context: BrowserContext = await chromium.launchPersistentContext(
    freshProfileDir,
    {
      channel: "msedge",
      headless: false,
      slowMo: 200,
      args: [
        "--no-sandbox",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        `--disable-extensions-except=${neoLineExtDir}`,
        `--load-extension=${neoLineExtDir}`,
      ],
      viewport: { width: 1280, height: 900 },
    }
  );

  const page = await context.newPage();

  try {
    // 4. Open NeoLine popup
    console.log("\nStep 1: Opening NeoLine first-time wizard...");
    await page.goto(
      `chrome-extension://${NEOLINE_ID}/index.html#popup`,
      { waitUntil: "domcontentloaded", timeout: 15_000 }
    );
    await waitAndSnap(page, 2000, "01-neoline-initial");

    // 5. Handle whatever screen appears first
    // Fresh NeoLine shows "Get started" / "Create wallet" / "Import wallet"
    await setupWallet(page, context);

    // 6. Configure myDevChain network
    console.log("\nStep 3: Adding myDevChain network...");
    await addCustomNetwork(page, context);

    // 7. Verify setup
    console.log("\nStep 4: Verifying setup...");
    await verifySetup(page);

    // 8. Copy the fresh profile to wallet-profile/
    console.log("\nStep 5: Saving wallet profile...");
    await context.close();

    if (fs.existsSync(WALLET_PROFILE_DIR)) {
      console.log("  Removing previous wallet profile...");
      fs.rmSync(WALLET_PROFILE_DIR, { recursive: true, force: true });
    }
    fs.cpSync(freshProfileDir, WALLET_PROFILE_DIR, { recursive: true });
    fs.rmSync(freshProfileDir, { recursive: true, force: true });

    const sizeMB =
      (
        dirSize(WALLET_PROFILE_DIR) /
        1024 /
        1024
      ).toFixed(1);

    console.log(`\n✅ Wallet profile saved to: ${WALLET_PROFILE_DIR}`);
    console.log(`   Size: ${sizeMB} MB`);
    console.log(`\n📝 Add to e2e/integration/.env.integration:`);
    console.log(`   NEOLINE_PASSWORD=${TEST_PASSWORD}`);
    console.log(`\nNext step: npm run test:integration`);
  } catch (err) {
    await snap(page, "error").catch(() => {});
    await context.close().catch(() => {});
    // Clean up temp dir on failure
    fs.rmSync(freshProfileDir, { recursive: true, force: true });
    throw err;
  }
}

// ── Wallet import wizard ──────────────────────────────────────────────────────

async function setupWallet(page: Page, _context: BrowserContext): Promise<void> {
  // Wait for Angular to fully render the initial screen
  await page.waitForTimeout(2000);

  // ── Step 1: Click "Import wallet" on the landing page ───────────────────
  const importBtn = page
    .getByRole("button", { name: /Import/i })
    .or(page.getByText(/Import wallet/i))
    .first();

  const hasImport = await importBtn.isVisible({ timeout: 5_000 }).catch(() => false);

  if (!hasImport) {
    // Some versions show a "Get Started" button first
    const getStarted = page.getByRole("button", { name: /Get [Ss]tarted/i }).first();
    if (await getStarted.isVisible({ timeout: 3_000 }).catch(() => false)) {
      console.log("  Clicking 'Get Started'...");
      await getStarted.click();
      await page.waitForTimeout(1500);
      await snap(page, "02-after-get-started");
    }
  }

  const importBtnFresh = page
    .getByRole("button", { name: /Import/i })
    .or(page.getByText(/Import wallet/i))
    .first();

  await expect(importBtnFresh).toBeVisible({ timeout: 10_000 });
  console.log("  Clicking 'Import wallet'...");
  await importBtnFresh.click();
  await page.waitForTimeout(1500);
  await snap(page, "02-import-wallet-screen");

  // ── Step 2: "Select a chain" dialog — choose Neo N3 ─────────────────────
  // NeoLine v5.7+ shows a chain selection dialog after clicking Import.
  const neoN3Option = page
    .getByText("Neo N3", { exact: true })
    .or(page.getByRole("button", { name: /^Neo N3$/i }))
    .or(page.locator("li, .chain-item, .option").filter({ hasText: /^Neo N3$/ }))
    .first();

  if (await neoN3Option.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log("  Selecting 'Neo N3' chain...");
    await neoN3Option.click();
    await page.waitForTimeout(1500);
    await snap(page, "03-neo-n3-selected");
  } else {
    await snap(page, "03-no-chain-dialog");
    console.log("  No chain selection dialog found — continuing...");
  }

  // ── Step 3: Fill the "Add Neo N3 account" import form ───────────────────
  // NeoLine uses Angular Material: labels are NOT in placeholder attrs.
  // Form fields in DOM order:
  //   [0] Set wallet name *       — type=text
  //   [1] Enter WIF(private key)* — type=password (eye icon toggle)
  //   [2] Enter password *        — type=password
  //   [3] Enter password again *  — type=password
  console.log("Step 2: Filling import form...");

  // Wait for the "Add Neo N3 account" heading to confirm the form is ready
  await page.getByText("Add Neo N3 account").waitFor({ timeout: 10_000 });
  await snap(page, "04-import-form-ready");

  // NeoLine uses Angular Material. The inner <input> elements are not "visible"
  // to Playwright's actionability checks (they're inside mat-form-field wrappers
  // with layered CSS). We fill all 4 fields in a single page.evaluate() call,
  // targeting visible inputs (non-zero dimensions) and dispatching the full
  // Angular-compatible event sequence.

  // First, log the input structure for diagnostics
  const inputDetails = await page.evaluate(() => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("input.mat-input-element")
    );
    return inputs.map((el, i) => ({
      i,
      type: el.type,
      fcn: el.getAttribute("formcontrolname"),
      id: el.id,
      w: el.offsetWidth,
      h: el.offsetHeight,
    }));
  });
  console.log("  mat-input-element structure:");
  inputDetails.forEach((d) =>
    console.log(`    [${d.i}] type=${d.type} fcn=${d.fcn} id=${d.id} ${d.w}x${d.h}`)
  );

  // Fill all 4 visible form fields in one evaluate call
  const fillResult = await page.evaluate(
    ([nameVal, wifVal, pwVal]) => {
      const allInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("input.mat-input-element")
      );

      // Visible = non-zero dimensions
      const visible = allInputs.filter(
        (el) => el.offsetWidth > 0 && el.offsetHeight > 0
      );

      if (visible.length < 4) {
        return { ok: false, msg: `Expected ≥4 visible inputs, got ${visible.length}` };
      }

      const fillOne = (el: HTMLInputElement, val: string): void => {
        el.focus();
        // Use native setter so Angular Material's ControlValueAccessor picks it up
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set;
        if (setter) setter.call(el, val);
        // Dispatch both input and change events for Angular reactive forms
        el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      };

      fillOne(visible[0], nameVal as string);  // wallet name
      fillOne(visible[1], wifVal as string);   // WIF (private key)
      fillOne(visible[2], pwVal as string);    // password
      fillOne(visible[3], pwVal as string);    // confirm password

      return {
        ok: true,
        filled: visible.slice(0, 4).map((el) => ({
          fcn: el.getAttribute("formcontrolname"),
          id: el.id,
          type: el.type,
        })),
      };
    },
    [WALLET_NAME, CONTAINER_WIF, TEST_PASSWORD] as [string, string, string]
  );

  console.log("  Fill result:", JSON.stringify(fillResult));

  if (!fillResult.ok) {
    await snap(page, "04b-fill-failed");
    throw new Error(`Fill failed: ${(fillResult as { ok: false; msg: string }).msg}`);
  }

  await page.waitForTimeout(800); // let Angular run change detection + validators

  await snap(page, "05-form-filled");

  // ── Step 4: Submit ────────────────────────────────────────────────────────
  // The teal "Import" button (not "Cancel")
  const submitBtn = page.getByRole("button", { name: /^Import$/i }).first();
  await expect(submitBtn).toBeVisible({ timeout: 5_000 });
  console.log("  Clicking 'Import'...");
  await submitBtn.click();

  await page.waitForTimeout(3000);
  await snap(page, "06-after-import");

  // ── Step 5: Verify ────────────────────────────────────────────────────────
  const hasAddress = await page
    .getByText(/^N[A-Za-z0-9]{33}/)
    .or(page.locator(".address, .wallet-address"))
    .first()
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (!hasAddress) {
    console.log("  NOTE: Wallet address not visible yet — continuing anyway.");
    await snap(page, "06b-no-address");
  } else {
    console.log("  ✅ Wallet imported successfully.");
  }
}

// ── Network setup ─────────────────────────────────────────────────────────────

async function addCustomNetwork(page: Page, _context: BrowserContext): Promise<void> {
  // ── Step 1: Navigate to main popup ────────────────────────────────────────
  await page.goto(
    `chrome-extension://${NEOLINE_ID}/index.html#popup`,
    { waitUntil: "domcontentloaded", timeout: 10_000 }
  );
  await page.waitForTimeout(1500);
  await snap(page, "07-main-screen");

  // ── Step 2: Click the "N3 Mainnet" network dropdown on the main screen ───
  // NeoLine shows the active network as a clickable button in the top-right.
  // Clicking it opens a network list where we can add a custom network.
  const networkDropdown = page
    .locator("button, [role='button']")
    .filter({ hasText: /Mainnet|Testnet/i })
    .first();

  if (await networkDropdown.isVisible({ timeout: 3_000 }).catch(() => false)) {
    console.log("  Clicking network dropdown (N3 Mainnet)...");
    await networkDropdown.click();
    await page.waitForTimeout(1500);
    await snap(page, "08-network-dropdown-open");
  } else {
    await snap(page, "08-no-network-dropdown");
    console.log("  WARNING: Network dropdown not found.");
  }

  // ── Step 3: Click "Add network" button (teal button at bottom of network list) ──
  const addNetworkBtn = page.getByRole("button", { name: /^Add network$/i }).first();

  if (!(await addNetworkBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    await snap(page, "08b-add-network-btn-not-found");
    console.log("  WARNING: 'Add network' button not found on Networks page.");
    return;
  }

  console.log("  Clicking 'Add network'...");
  await addNetworkBtn.click();
  await page.waitForTimeout(1500);
  await snap(page, "09-select-chain-modal");

  // ── Step 4: "Select a chain" modal — choose Neo N3 ───────────────────────
  // After clicking Add network, a CDK overlay dialog appears with "Select a chain".
  // The element must be inside .cdk-overlay-pane (not the background span).
  const dialogPane = page.locator(".cdk-overlay-pane, mat-dialog-container, [role='dialog']");

  const neoN3Chain = dialogPane
    .getByText("Neo N3", { exact: true })
    .or(dialogPane.locator("li, .chain-item, .option").filter({ hasText: /^Neo N3$/ }))
    .first();

  if (await neoN3Chain.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log("  Selecting 'Neo N3' in chain modal...");
    await neoN3Chain.click({ force: true }); // force to avoid backdrop interception
    await page.waitForTimeout(1500);
    await snap(page, "10-add-network-form");
  } else {
    await snap(page, "10-no-chain-modal");
    console.log("  No 'Select a chain' modal — may already be on the form.");
  }

  // ── Step 5: Check we're on the add-network form ──────────────────────────
  const formInputCount = await page.locator("input.mat-input-element").count();
  if (formInputCount === 0) {
    await snap(page, "10c-add-network-form-not-found");
    console.log(
      "  WARNING: Could not find the add-network form.\n" +
        "  Add manually in NeoLine settings:\n" +
        `    Name:  ${MYDEVCHAIN.name}\n` +
        `    RPC:   ${MYDEVCHAIN.rpc}\n` +
        `    Magic: ${MYDEVCHAIN.magic}`
    );
    return;
  }

  await snap(page, "11-add-network-form");

  // ── Step 6: Fill network form (Angular Material inputs) ───────────────────
  // NeoLine's add-network form uses mat-input-element inputs.
  // Fields: Name, RPC URL, (possibly) Magic/Network ID
  const fillResult = await page.evaluate(
    ([nameVal, rpcVal, magicVal]) => {
      const inputs = Array.from(
        document.querySelectorAll<HTMLInputElement>("input.mat-input-element")
      );
      const visible = inputs.filter((el) => el.offsetWidth > 0 && el.offsetHeight > 0);
      const fillOne = (el: HTMLInputElement, val: string) => {
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(el, val);
        el.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
      };
      if (visible.length >= 1) fillOne(visible[0], nameVal as string);
      if (visible.length >= 2) fillOne(visible[1], rpcVal as string);
      if (visible.length >= 3) fillOne(visible[2], magicVal as string);
      return { count: visible.length };
    },
    [MYDEVCHAIN.name, MYDEVCHAIN.rpc, MYDEVCHAIN.magic] as [string, string, string]
  );
  console.log(`  Filled ${fillResult.count} network field(s)`);
  await page.waitForTimeout(500);
  await snap(page, "12-network-form-filled");

  // ── Step 7: Save ──────────────────────────────────────────────────────────
  const saveBtn = page
    .getByRole("button", { name: /^Save$|^Confirm$|^Add$|^OK$/i })
    .last();
  if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await snap(page, "13-network-saved");
    console.log("  myDevChain network saved.");
  }

  // ── Step 8: Switch to myDevChain ─────────────────────────────────────────
  // Go back to main screen and click the network selector
  await page.goto(
    `chrome-extension://${NEOLINE_ID}/index.html#popup`,
    { waitUntil: "domcontentloaded", timeout: 10_000 }
  );
  await page.waitForTimeout(1500);

  const myDevChainEntry = page
    .getByText(MYDEVCHAIN.name, { exact: true })
    .or(page.getByRole("option", { name: MYDEVCHAIN.name }))
    .first();

  if (!(await myDevChainEntry.isVisible({ timeout: 3_000 }).catch(() => false))) {
    // Click the network dropdown to reveal options
    const networkDropdown = page
      .locator("button, [role='button']")
      .filter({ hasText: /Mainnet|Testnet/i })
      .first();
    if (await networkDropdown.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await networkDropdown.click();
      await page.waitForTimeout(1000);
      await snap(page, "14-network-dropdown-open");
    }
  }

  const myDevEntry = page.getByText(MYDEVCHAIN.name, { exact: true }).first();
  if (await myDevEntry.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log("  Switching to myDevChain...");
    await myDevEntry.click();
    await page.waitForTimeout(2000);
    await snap(page, "15-switched-to-mydevchain");
    console.log("  ✅ Switched to myDevChain.");
  } else {
    console.log(
      `  ⚠ Could not find '${MYDEVCHAIN.name}' to switch — check screenshots.`
    );
    await snap(page, "15-mydevchain-not-found");
  }
}

// ── Verify ───────────────────────────────────────────────────────────────────

async function verifySetup(page: Page): Promise<void> {
  // Navigate to the main wallet popup to verify
  await page.goto(
    `chrome-extension://${NEOLINE_ID}/index.html#popup`,
    { waitUntil: "domcontentloaded", timeout: 10_000 }
  );
  await page.waitForTimeout(2000);
  await snap(page, "15-final-verification");

  // Check for the wallet address
  const expectedAddressPrefix = "NV1Q1d";
  const addressVisible = await page
    .getByText(new RegExp(expectedAddressPrefix))
    .first()
    .isVisible({ timeout: 5_000 })
    .catch(() => false);

  if (addressVisible) {
    console.log(`  ✅ Wallet address visible (starts with ${expectedAddressPrefix})`);
  } else {
    console.log("  ⚠  Could not verify wallet address — check screenshots.");
  }

  // Check for myDevChain in the network selector
  const networkVisible = await page
    .getByText(MYDEVCHAIN.name)
    .first()
    .isVisible({ timeout: 3_000 })
    .catch(() => false);

  if (networkVisible) {
    console.log(`  ✅ Network '${MYDEVCHAIN.name}' is active`);
  } else {
    console.log(`  ⚠  Network '${MYDEVCHAIN.name}' not visible in header — may need manual setup.`);
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function dirSize(dir: string): number {
  let size = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) size += dirSize(full);
      else if (entry.isFile()) size += fs.statSync(full).size;
    }
  } catch { /* ignore access errors */ }
  return size;
}

// ── Run ───────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("\n❌ Setup failed:", err.message ?? err);
  console.error(`\nDebug screenshots: ${DEBUG_SCREENSHOTS_DIR}`);
  process.exit(1);
});
