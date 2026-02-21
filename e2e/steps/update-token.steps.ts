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

/**
 * Navigate to the detail page of the first own upgradeable token.
 * An upgradeable token shows the "Update Token" button on its detail page.
 */
async function navigateToOwnUpgradeableToken(
  page: import("@playwright/test").Page,
  address: string
): Promise<void> {
  await page.goto("/tokens");
  await connectWallet(page, address);
  await page.waitForTimeout(2_000); // allow token list to load

  // Wait for own token cards to appear (token list loads asynchronously)
  const ownCards = page.locator("article").filter({ has: page.getByLabel("Your token") });
  await expect(ownCards.first()).toBeVisible({ timeout: 10_000 });
  const count = await ownCards.count();

  for (let i = 0; i < count; i++) {
    await ownCards.nth(i).click();
    await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
    // waitFor() is used instead of isVisible() because isVisible() is a synchronous
    // snapshot — it returns false immediately if metadata hasn't loaded yet.
    // Token detail loads isUpgradeable asynchronously from on-chain data (~2–8 s).
    const hasUpdateBtn = await page
      .getByRole("button", { name: "Update Token" })
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (hasUpdateBtn) return;
    // Not upgradeable — go back and try the next card
    await page.goto("/tokens");
    await connectWallet(page, address);
    await page.waitForTimeout(1_000);
  }

  // Fallback: click first own card regardless (test will surface the issue clearly)
  if (count > 0) {
    await ownCards.first().click();
    await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
  }
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
  "the UpdateOverlay is open for an own upgradeable token",
  async ({ page, mockDapi }) => {
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
    // Wait for WaitingOverlay to appear — mock-dapi signs+submits a real TX which
    // takes ~2–5 s; 30 s gives plenty of headroom for a slow devnet.
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).toBeVisible({ timeout: 30_000 });
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

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then("the UpdateOverlay modal is visible", async ({ page }) => {
  await expect(
    page.getByRole("dialog", { name: "Update Token" })
  ).toBeVisible();
});

Then("the name field is pre-filled", async ({ page }) => {
  // The name field should have a non-empty value (pre-populated from on-chain data)
  await expect(page.getByLabel("Token Name")).not.toHaveValue("");
});

Then("the name field shows {string}", async ({ page }, expectedName: string) => {
  await expect(page.getByLabel("Token Name")).toHaveValue(expectedName);
});

Then("the other fields show the current on-chain values", async ({ page }) => {
  // Symbol input should have a non-empty value
  const symbol = page.getByLabel(/^Symbol/);
  await expect(symbol).not.toHaveValue("");
  // Supply and decimals are shown as read-only text in the dialog.
  // Scope to the dialog to avoid matching the token detail page's dl which also has "Decimals".
  const dialog = page.getByRole("dialog", { name: "Update Token" });
  await expect(dialog.getByText("Total Supply")).toBeVisible();
  await expect(dialog.getByText("Decimals")).toBeVisible();
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
