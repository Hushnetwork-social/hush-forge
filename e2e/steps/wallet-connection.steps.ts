/**
 * Step definitions for: wallet-connection.feature
 *
 * Shared steps (the user navigates to /tokens, the wallet is connected) are
 * defined in common.steps.ts.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given("the user has connected their wallet", async ({ page, mockDapi }) => {
  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When("the page is refreshed", async ({ page }) => {
  await page.reload();
});

When("the user disconnects the wallet", async ({ page }) => {
  await page.getByRole("button", { name: "Disconnect" }).click();
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then("the wallet connection modal appears", async ({ page }) => {
  await expect(
    page.getByRole("dialog", { name: "Connect Wallet" })
  ).toBeVisible();
});

/**
 * Clicks "Neon Wallet" in the Connect Wallet modal (injected by mock-dapi as
 * window.neon), then asserts the truncated address appears in the header.
 */
Then(
  "after connecting the wallet address is shown in the header",
  async ({ page, mockDapi }) => {
    await page.getByRole("button", { name: "Neon Wallet" }).click();
    const prefix = mockDapi.address.slice(0, 6);
    // The address appears in both ForgeHeader and WalletPanel — use .first() to
    // avoid strict-mode errors when multiple elements match the prefix regex.
    await expect(page.getByText(new RegExp(prefix)).first()).toBeVisible({
      timeout: 10_000,
    });
  }
);

Then(
  "the wallet remains connected without prompting again",
  async ({ page, mockDapi }) => {
    const prefix = mockDapi.address.slice(0, 6);
    // Use .first() — address appears in both ForgeHeader and WalletPanel
    await expect(page.getByText(new RegExp(prefix)).first()).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Connect Wallet" })
    ).not.toBeVisible();
  }
);

Then("the header shows {string} again", async ({ page }, text: string) => {
  // "Connect Wallet" appears in both ForgeHeader and WalletPanel after disconnect
  await expect(page.getByRole("button", { name: text }).first()).toBeVisible();
});

Then("the token list is cleared", async ({ page }) => {
  // After disconnect the WalletPanel (and TokenGrid) shows a "connect" prompt
  await expect(
    page.getByText(/Connect your (Neo wallet|wallet)/)
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// Persistence helper: make localStorage survive a reload
// ---------------------------------------------------------------------------

// "Given the user has connected their wallet" calls connectWallet() which writes
// localStorage.  "When the page is refreshed" reloads the page.  The app's
// tryAutoReconnect() picks up the saved wallet type and re-connects.
// "Then the wallet remains connected" then asserts the address is still visible.
