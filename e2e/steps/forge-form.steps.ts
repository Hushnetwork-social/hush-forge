/**
 * Step definitions for: forge-form.feature
 *
 * Shared steps (wallet connected, overlay open, FORGE disabled) are in
 * common.steps.ts.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { openForgeOverlay } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given("the wallet has enough GAS to pay the creation fee", async ({ page, mockDapi }) => {
  // connect wallet with the test account — alice has GAS on the devnet
  await page.goto("/tokens");
  await page.evaluate(
    (key: string) => localStorage.setItem(key, "Neon"),
    "forge_wallet_type"
  );
  await page.reload();
  const prefix = mockDapi.address.slice(0, 6);
  await page.waitForFunction(
    (p: string) => document.body.textContent?.includes(p) ?? false,
    prefix,
    { timeout: 10_000 }
  );
});

Given("the wallet has less GAS than the creation fee", async ({ page }) => {
  // Navigate with wallet connected but mock the gasBalance as 0 by not
  // having any GAS in the test account — this scenario requires a devnet
  // account with insufficient GAS, or we test by observing the fee-check UI.
  // For testing purposes, we simply open the overlay and let the real balance check run.
  // If the test account genuinely has insufficient GAS, the indicator shows red.
  await page.goto("/tokens");
  await page.evaluate(
    (key: string) => localStorage.setItem(key, "Neon"),
    "forge_wallet_type"
  );
  await page.reload();
  await page.waitForTimeout(1_000); // allow balance fetch to settle
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When("the user clicks the {string} button", async ({ page }, buttonText: string) => {
  await page.getByRole("button", { name: buttonText }).click();
});

When(
  "the user types {string} into the symbol field",
  async ({ page }, value: string) => {
    // Symbol input auto-uppercases via onChange
    await page.getByLabel(/^Symbol/).fill(value);
  }
);

When(
  "the user enters {string} as the symbol",
  async ({ page }, value: string) => {
    await page.getByLabel(/^Symbol/).fill(value);
    // Trigger blur to ensure validation runs
    await page.keyboard.press("Tab");
  }
);

When("the user clears the token name field", async ({ page }) => {
  await page.getByLabel("Token Name").fill("");
  await page.keyboard.press("Tab");
});

When("the user enters {int} as the total supply", async ({ page }, value: number) => {
  await page.getByLabel("Total Supply").fill(String(value));
  await page.keyboard.press("Tab");
});

When("the user clicks Cancel", async ({ page }) => {
  await page.getByRole("button", { name: "Cancel" }).click();
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then("the GAS creation fee is displayed", async ({ page }) => {
  // Fee row shows "~X.XX GAS" or "Loading…" then the fee
  await expect(page.getByText(/GAS|Loading/)).toBeVisible();
  await expect(page.getByText("Creation fee")).toBeVisible();
});

Then("the symbol field shows {string}", async ({ page }, expected: string) => {
  const input = page.getByLabel(/^Symbol/);
  await expect(input).toHaveValue(expected);
});

Then("a validation error appears on the symbol field", async ({ page }) => {
  // Error message appears below the Symbol input
  const symbolSection = page.locator("div").filter({ hasText: /^Symbol/ }).first();
  await expect(symbolSection.locator("p")).toBeVisible({ timeout: 3_000 });
});

Then("a validation error appears on the name field", async ({ page }) => {
  const nameSection = page.locator("div").filter({ hasText: /^Token Name/ }).first();
  await expect(nameSection.locator("p")).toBeVisible({ timeout: 3_000 });
});

Then("a validation error appears on the supply field", async ({ page }) => {
  const supplySection = page.locator("div").filter({ hasText: /^Total Supply/ }).first();
  await expect(supplySection.locator("p")).toBeVisible({ timeout: 3_000 });
});

Then("the GAS balance indicator shows green", async ({ page }) => {
  // The balance check shows "✓" in forge-color-success (green) style
  const balanceRow = page.getByText(/Your GAS balance/).locator("..");
  await expect(balanceRow.getByText("✓")).toBeVisible({ timeout: 10_000 });
});

Then("the GAS balance indicator shows red", async ({ page }) => {
  // Insufficient GAS shows "✗" and the red error message
  await expect(page.getByText(/Insufficient GAS/)).toBeVisible({ timeout: 10_000 });
});

Then("the Forge overlay is no longer visible", async ({ page }) => {
  await expect(
    page.getByRole("dialog", { name: "Forge a Token" })
  ).not.toBeVisible();
});
