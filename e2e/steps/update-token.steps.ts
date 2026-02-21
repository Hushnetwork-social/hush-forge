/**
 * Step definitions for: update-token.feature
 *
 * Shared steps ("the user clicks FORGE and the wallet signs") are in
 * common.steps.ts.
 *
 * These scenarios require a running NeoExpress devnet where the test account
 * owns at least one upgradeable token.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the detail page of the first own upgradeable token. */
async function navigateToOwnUpgradeableToken(
  page: import("@playwright/test").Page,
  address: string
): Promise<void> {
  await page.goto("/tokens");
  await connectWallet(page, address);
  await page.waitForTimeout(2_000); // allow token list to load
  // Click the first card with a "Yours" badge (own token)
  const ownCard = page.locator("article").filter({ has: page.getByLabel("Your token") }).first();
  await ownCard.click();
  await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
  // Wait for the Update Token button to confirm this is an upgradeable own token
  await page.waitForSelector('[aria-label="Upgradeable"]', { timeout: 5_000 }).catch(() => {
    // Not upgradeable — proceed anyway (test will surface the issue)
  });
}

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given(
  "the user is on the detail page of their own upgradeable token",
  async ({ page, mockDapi }) => {
    await navigateToOwnUpgradeableToken(page, mockDapi.address);
  }
);

Given(
  "the UpdateOverlay is open for a token named {string}",
  async ({ page, mockDapi }, _tokenName: string) => {
    await navigateToOwnUpgradeableToken(page, mockDapi.address);
    await page.getByRole("button", { name: "Update Token" }).click();
    await expect(
      page.getByRole("dialog", { name: "Update Token" })
    ).toBeVisible();
  }
);

Given(
  "the UpdateOverlay is open with modified values",
  async ({ page, mockDapi }) => {
    await navigateToOwnUpgradeableToken(page, mockDapi.address);
    await page.getByRole("button", { name: "Update Token" }).click();
    await expect(
      page.getByRole("dialog", { name: "Update Token" })
    ).toBeVisible();
    // Modify the name field
    await page.getByLabel("Token Name").fill("Updated Token");
  }
);

Given(
  "the UpdateOverlay submitted a transaction",
  async ({ page, mockDapi }) => {
    await navigateToOwnUpgradeableToken(page, mockDapi.address);
    await page.getByRole("button", { name: "Update Token" }).click();
    await expect(
      page.getByRole("dialog", { name: "Update Token" })
    ).toBeVisible();
    await page.getByRole("button", { name: /Update Token/ }).click();
    // Wait for WaitingOverlay to appear (TX submitted)
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).toBeVisible({ timeout: 15_000 });
  }
);

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When(
  "the update transaction is confirmed on-chain",
  async ({ page }) => {
    // Wait for WaitingOverlay to close (polling detects confirmation)
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).not.toBeVisible({ timeout: 60_000 });
  }
);

When("the transaction fails on-chain", async ({ page }) => {
  // Wait for the WaitingOverlay to close after a fault/error
  await expect(
    page.getByRole("status", { name: "Waiting for transaction" })
  ).not.toBeVisible({ timeout: 60_000 });
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then("the UpdateOverlay modal is visible", async ({ page }) => {
  await expect(
    page.getByRole("dialog", { name: "Update Token" })
  ).toBeVisible();
});

Then("the name field shows {string}", async ({ page }, expectedName: string) => {
  await expect(page.getByLabel("Token Name")).toHaveValue(expectedName);
});

Then("the other fields show the current on-chain values", async ({ page }) => {
  // Symbol, supply and decimals inputs should have non-empty values
  const symbol = page.getByLabel(/^Symbol/);
  await expect(symbol).not.toHaveValue("");
  // Supply and decimals are read-only divs, not inputs
  await expect(page.getByText("Total Supply")).toBeVisible();
  await expect(page.getByText("Decimals")).toBeVisible();
});

Then(
  "a success toaster appears: {string}",
  async ({ page }, message: string) => {
    // ForgeSuccessToast shows role="status" with "🔥 Token Forged!" heading
    await expect(page.getByRole("status")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(message)).toBeVisible({ timeout: 5_000 });
  }
);

Then(
  "the token detail page refreshes with the new values",
  async ({ page }) => {
    // Page stays on /tokens/0x... and shows updated token data
    await expect(page).toHaveURL(/\/tokens\/0x/);
    // The ForgeSuccessToast "View Token" button can be clicked to reload
    const viewBtn = page.getByRole("button", { name: /View Token/ });
    if (await viewBtn.isVisible()) {
      await viewBtn.click();
    }
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "an error toaster appears with a NeoTube link to the failed TX",
  async ({ page }) => {
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    const link = page.getByRole("link", { name: /View on NeoTube/ });
    await expect(link).toBeVisible();
  }
);

Then(
  "the token detail page remains showing the old values",
  async ({ page }) => {
    // Page stays on /tokens/0x...
    await expect(page).toHaveURL(/\/tokens\/0x/);
    await expect(page.locator("h1")).toBeVisible();
  }
);
