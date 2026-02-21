/**
 * Step definitions for: forge-transaction.feature
 *
 * Shared steps (wallet connected, overlay open, FORGE disabled,
 * "the user clicks FORGE and the wallet signs") are in common.steps.ts.
 *
 * These scenarios require a running NeoExpress devnet and a funded test
 * account configured via E2E_TEST_ACCOUNT_ADDRESS / E2E_TEST_ACCOUNT_WIF.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { openForgeOverlay, fillValidForgeForm, connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given(
  "the wallet is connected with sufficient GAS",
  async ({ page, mockDapi }) => {
    // The test account (alice) has GAS on the devnet — same as "wallet is connected"
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
  }
);

Given(
  "the WaitingOverlay is waiting for txHash {string}",
  async ({ page, mockDapi }, _txHash: string) => {
    // Navigate to the Forge overlay, submit a valid form, and wait for
    // the WaitingOverlay to appear (with the real or mock txHash).
    await openForgeOverlay(page, mockDapi.address);
    await fillValidForgeForm(page);
    await page.getByRole("button", { name: /FORGE/ }).click();
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).toBeVisible({ timeout: 15_000 });
  }
);

Given("a token was successfully created", async ({ page, mockDapi }) => {
  // Perform the full forge flow so the token exists in the store / on-chain
  await openForgeOverlay(page, mockDapi.address);
  await fillValidForgeForm(page);
  await page.getByRole("button", { name: /FORGE/ }).click();
  // Wait for redirect to token detail page (polling confirms the TX)
  await page.waitForURL(/\/tokens\/0x/, { timeout: 60_000 });
  // Navigate back to dashboard
  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When("the user clicks the FORGE button", async ({ page }) => {
  await page.getByRole("button", { name: /FORGE/ }).click();
});

When("the mock wallet signs the transaction", async () => {
  // No-op — the mock dAPI auto-signs every invoke() call unless in reject mode
});

When(
  "the transaction is confirmed on the private devnet",
  async ({ page }) => {
    // Wait for the WaitingOverlay to close (polling detects confirmation)
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).not.toBeVisible({ timeout: 60_000 });
  }
);

When(
  "the transaction is confirmed with contract hash {string}",
  async ({ page }) => {
    // Wait for redirect which happens when useTokenPolling detects "confirmed"
    await page.waitForURL(/\/tokens\/0x/, { timeout: 60_000 });
  }
);

When(/the user navigates back to \/tokens/, async ({ page, mockDapi }) => {
  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then("the user is redirected to the token detail page", async ({ page }) => {
  await page.waitForURL(/\/tokens\/0x/, { timeout: 60_000 });
});

Then("the new token appears in the own tokens list", async ({ page, mockDapi }) => {
  // Navigate back to the token list (we are on the detail page at this point)
  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
  await page.waitForTimeout(3_000); // allow token list to load from chain
  // Own tokens show the "Yours" badge
  await expect(page.getByLabel("Your token").first()).toBeVisible({ timeout: 15_000 });
});

Then(
  "the Forge overlay is replaced by the WaitingOverlay",
  async ({ page }) => {
    await expect(
      page.getByRole("dialog", { name: "Forge a Token" })
    ).not.toBeVisible();
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).toBeVisible({ timeout: 15_000 });
  }
);

Then(
  "the WaitingOverlay shows a spinner and {string}",
  async ({ page }, message: string) => {
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).toBeVisible();
    await expect(page.getByText(message)).toBeVisible();
  }
);

Then("the transaction hash is displayed", async ({ page }) => {
  // WaitingOverlay shows truncated txHash as a NeoTube link
  // txHash is "0x..." — look for the truncated form (first 8 + "..." + last 6)
  await expect(page.getByRole("link", { name: /↗/ })).toBeVisible();
});

Then(
  "a link to NeoTube explorer is shown for the transaction",
  async ({ page }) => {
    const link = page.getByRole("link", { name: /↗/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /neotube\.io\/transaction\//);
  }
);

Then(
  /the user is redirected to \/tokens\/([^\s]+)/,
  async ({ page }, contractHash: string) => {
    await expect(page).toHaveURL(`/tokens/${contractHash}`);
  }
);

Then("the newly created token appears with a Yours badge", async ({ page }) => {
  await expect(page.getByLabel("Your token").first()).toBeVisible({ timeout: 15_000 });
});
