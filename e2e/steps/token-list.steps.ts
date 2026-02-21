/**
 * Step definitions for: token-list.feature
 *
 * "the user navigates to /tokens" is defined in common.steps.ts.
 *
 * These scenarios require a running NeoExpress devnet where the test account
 * has created at least one token via the TokenFactory.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given(
  "the wallet is connected with the test account",
  async ({ page, mockDapi }) => {
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
  }
);

Given(
  "the test account has created at least one token",
  async ({ page, mockDapi }) => {
    // Assumes the devnet has been pre-seeded: alice has forged ≥1 token.
    // Navigate to the dashboard and wait for tokens to load.
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
    await page.waitForTimeout(3_000); // allow token list to load
  }
);

Given(
  "the test account holds tokens it does not own",
  async ({ page, mockDapi }) => {
    // Assumes the test account's balance includes tokens from other creators
    // (e.g. native GAS/NEO tokens which are owned by the protocol, not the user).
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
    await page.waitForTimeout(3_000);
  }
);

Given("a fresh wallet with no token holdings", async ({ page }) => {
  // Navigate without connecting a wallet — TokenGrid shows the "no wallet" state.
  await page.goto("/tokens");
  // Do NOT connect — the token grid should show empty / connect prompt.
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When(/the user views the \/tokens dashboard/, async ({ page, mockDapi }) => {
  if (!page.url().includes("/tokens")) {
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
  }
  await page.waitForTimeout(2_000); // allow token grid to render
});

When(
  "the user clicks the {string} tab",
  async ({ page }, tabLabel: string) => {
    await page.getByRole("tab", { name: tabLabel }).click();
    await page.waitForTimeout(500); // allow filter to apply
  }
);

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then(
  "the token grid shows tokens held by the test account",
  async ({ page }) => {
    // At least one TokenCard should be rendered in the grid
    await expect(page.locator(".grid > *").first()).toBeVisible({
      timeout: 10_000,
    });
  }
);

Then("each own token shows a Yours badge", async ({ page }) => {
  const badges = page.getByLabel("Your token");
  await expect(badges.first()).toBeVisible({ timeout: 10_000 });
  expect(await badges.count()).toBeGreaterThan(0);
});

Then(
  "only tokens created by the test account are shown",
  async ({ page }) => {
    // All visible token cards should belong to the test address
    // Every visible card should have the Yours badge
    const allCards = page.locator("article");
    const cardCount = await allCards.count();
    const yoursCount = await page.getByLabel("Your token").count();
    expect(yoursCount).toBe(cardCount);
  }
);

Then("the token grid shows an empty state message", async ({ page }) => {
  // No wallet connected → "Connect your wallet to see tokens"
  await expect(
    page.getByText(/Connect your wallet to see tokens/)
  ).toBeVisible({ timeout: 5_000 });
});
