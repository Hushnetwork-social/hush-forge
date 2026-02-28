/**
 * Common step definitions shared across multiple feature files.
 *
 * Rules:
 * - A step text may only be defined ONCE across all step files.
 * - Shared steps (used in 2+ feature files) live here.
 * - Feature-specific steps live in their own file.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import type { Page } from "@playwright/test";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Internal helpers (exported for use in other step files)
// ---------------------------------------------------------------------------

/** localStorage key that persists the chosen wallet type. */
export const WALLET_KEY = "forge_wallet_type";

/**
 * Simulates auto-reconnect by writing "Neon" to localStorage then reloading.
 * Waits for the truncated address to appear in the header.
 */
export async function connectWallet(page: Page, address: string): Promise<void> {
  await page.evaluate(
    (key: string) => localStorage.setItem(key, "Neon"),
    WALLET_KEY
  );
  await page.reload();
  // Wait until the first 6 chars of the address appear in the header
  const prefix = address.slice(0, 6);
  await page.waitForFunction(
    (p: string) => document.body.textContent?.includes(p) ?? false,
    prefix,
    { timeout: 10_000 }
  );
}

/**
 * Navigates to /tokens, connects wallet, clicks "Forge Token" and waits for
 * the Forge overlay to appear.
 *
 * Does NOT wait for the FORGE submit button to be enabled — call
 * waitForForgeReady() afterwards when the scenario needs to submit the form.
 */
export async function openForgeOverlay(page: Page, address: string): Promise<void> {
  if (!page.url().includes("/tokens")) {
    await page.goto("/tokens");
  }
  await connectWallet(page, address);
  // Wait for the factory deployment check to complete — the button stays disabled
  // while useFactoryDeployment is in "checking" state (async RPC call).
  const forgeBtn = page.getByRole("button", { name: "Forge Token" });
  await expect(forgeBtn).not.toBeDisabled({ timeout: 10_000 });
  await forgeBtn.click();
  await expect(page.getByRole("dialog", { name: "Forge a Token" })).toBeVisible();
}

/**
 * Waits for the FORGE submit button inside the overlay to become enabled.
 * Call this after openForgeOverlay() only when the scenario intends to submit
 * (i.e. the GAS balance is sufficient and the form fee has loaded).
 * Do NOT call this in scenarios that intentionally test the disabled state
 * (e.g. insufficient GAS balance).
 */
export async function waitForForgeReady(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /FORGE/ })).not.toBeDisabled({ timeout: 10_000 });
}

/**
 * Fills the Forge overlay form with valid token details.
 */
export async function fillValidForgeForm(page: Page): Promise<void> {
  await page.getByLabel("Token Name").fill("Hush Token");
  // Symbol label text is "Symbol (A-Z only, 2-10)" — use regex
  await page.getByLabel(/^Symbol/).fill("HUSH");
  await page.getByLabel("Total Supply").fill("1000000");
  await page.getByLabel(/^Decimals/).fill("8");
}

// ---------------------------------------------------------------------------
// Shared Given steps
// ---------------------------------------------------------------------------

Given(/the user navigates to \/tokens$/, async ({ page }) => {
  await page.goto("/tokens");
});

Given("the wallet is connected", async ({ page, mockDapi }) => {
  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
});

Given("the Forge overlay is open", async ({ page, mockDapi }) => {
  await openForgeOverlay(page, mockDapi.address);
});

Given("the Forge overlay is open with valid token details", async ({ page, mockDapi }) => {
  await openForgeOverlay(page, mockDapi.address);
  await waitForForgeReady(page);
  await fillValidForgeForm(page);
});

Given("the Forge overlay is open with a valid form", async ({ page, mockDapi }) => {
  await openForgeOverlay(page, mockDapi.address);
  await waitForForgeReady(page);
  await fillValidForgeForm(page);
});

Given("a pending transaction toast is visible", async ({ page, mockDapi }) => {
  await openForgeOverlay(page, mockDapi.address);
  await waitForForgeReady(page);
  await fillValidForgeForm(page);
  // Override invoke() to return a fake txid instantly - the pending toast only
  // needs the txHash to be set, not an actual confirmed on-chain TX.
  // This avoids waiting 30 s for a real TX, which is unnecessary for accessibility tests.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).neon.invoke = async () => ({
      txid: "0x" + "a".repeat(64),
      nodeURL: "http://localhost:10332",
    });
  });
  await page.getByRole("button", { name: /FORGE/ }).click();
  await expect(
    page.getByRole("status", { name: "Pending transaction status" })
  ).toBeVisible({ timeout: 10_000 });
});

// ---------------------------------------------------------------------------
// Shared When steps
// ---------------------------------------------------------------------------

When("the user clicks {string}", async ({ page }, buttonText: string) => {
  // Use .first() because some buttons (e.g. "Connect Wallet") appear in both
  // the header and the main content area when the wallet is not connected.
  await page.getByRole("button", { name: buttonText }).first().click();
});

/**
 * Clicks the primary submit button in whichever overlay is open
 * (ForgeOverlay → "🔥 FORGE", UpdateOverlay → "✏️ Update Token").
 * The mock dAPI auto-signs — no additional user action is needed.
 */
When("the user clicks FORGE and the wallet signs", async ({ page }) => {
  const forgeBtn = page.getByRole("button", { name: /FORGE/ });
  if (await forgeBtn.isVisible()) {
    await forgeBtn.click();
  } else {
    // Scope to the Update Token dialog to avoid matching the detail-page button behind it.
    const dialog = page.getByRole("dialog", { name: "Update Token" });
    await dialog.getByRole("button", { name: /Update Token/ }).click();
  }
});

// ---------------------------------------------------------------------------
// Shared Then steps
// ---------------------------------------------------------------------------

Then("the Forge overlay modal is visible", async ({ page }) => {
  await expect(page.getByRole("dialog", { name: "Forge a Token" })).toBeVisible();
});

Then("the FORGE button is disabled", async ({ page }) => {
  await expect(page.getByRole("button", { name: /FORGE/ })).toBeDisabled();
});

Then(/the user is back on the \/tokens dashboard/, async ({ page }) => {
  await expect(page).toHaveURL("/tokens");
  await expect(
    page.getByRole("dialog", { name: "Forge a Token" })
  ).not.toBeVisible();
});

Then(/the user remains on the \/tokens dashboard/, async ({ page }) => {
  await expect(page).toHaveURL("/tokens");
});
