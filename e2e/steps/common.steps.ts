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
 */
export async function openForgeOverlay(page: Page, address: string): Promise<void> {
  if (!page.url().includes("/tokens")) {
    await page.goto("/tokens");
  }
  await connectWallet(page, address);
  // Wait for the factory deployment check to complete — the button stays disabled
  // while useFactoryDeployment is in "checking" state (async RPC call).
  const forgeBtn = page.getByRole("button", { name: "Forge Token" });
  await expect(forgeBtn).not.toBeDisabled({ timeout: 20_000 });
  await forgeBtn.click();
  await expect(page.getByRole("dialog", { name: "Forge a Token" })).toBeVisible();
  // Wait for the creation fee to load (fee loading keeps the FORGE button disabled)
  await expect(page.getByRole("button", { name: /FORGE/ })).not.toBeDisabled({ timeout: 15_000 });
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
  await fillValidForgeForm(page);
});

Given("the Forge overlay is open with a valid form", async ({ page, mockDapi }) => {
  await openForgeOverlay(page, mockDapi.address);
  await fillValidForgeForm(page);
});

Given("the WaitingOverlay is active", async ({ page, mockDapi }) => {
  await openForgeOverlay(page, mockDapi.address);
  await fillValidForgeForm(page);
  await page.getByRole("button", { name: /FORGE/ }).click();
  await expect(
    page.getByRole("status", { name: "Waiting for transaction" })
  ).toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// Shared When steps
// ---------------------------------------------------------------------------

When("the user clicks {string}", async ({ page }, buttonText: string) => {
  await page.getByRole("button", { name: buttonText }).click();
});

/**
 * Clicks the primary submit button in whichever overlay is open
 * (ForgeOverlay → "🔥 FORGE", UpdateOverlay → "✏️ Update Token").
 * The mock dAPI auto-signs — no additional user action is needed.
 */
When("the user clicks FORGE and the wallet signs", async ({ page }) => {
  const forgeBtn = page.getByRole("button", { name: /FORGE/ });
  const updateBtn = page.getByRole("button", { name: /Update Token/ });
  if (await forgeBtn.isVisible()) {
    await forgeBtn.click();
  } else {
    await updateBtn.click();
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
