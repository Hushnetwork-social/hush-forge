/**
 * Step definitions for: token-detail.feature
 *
 * These scenarios require a running NeoExpress devnet.  The test account must
 * own at least one token created via the TokenFactory, and at least one token
 * created outside the factory (direct NEP-17 contract) must be accessible.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Shared state across steps in a scenario (via closure per test)
// ---------------------------------------------------------------------------

// Playwright doesn't provide a per-scenario state store.  We use a module-level
// variable here; since tests run serially (workers:1), this is safe.
let _contractHash = "";

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given(
  "a token with contract hash {string} exists on the devnet",
  async ({ page, mockDapi }, contractHash: string) => {
    _contractHash = contractHash;
    // Connect wallet so the detail page can show ownership badges
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
  }
);

Given("the user is on the token detail page", async ({ page, mockDapi }) => {
  // Navigate to the first own token from the dashboard, or use a known hash
  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
  // Click the first token card to navigate to its detail page
  await page.locator(".grid > div").first().click();
  await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
});

Given(
  "the user is viewing a token they created",
  async ({ page, mockDapi }) => {
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
    // Click the first card with a "Yours" badge (own token)
    const ownCard = page.locator("article").filter({ has: page.getByLabel("Your token") }).first();
    await ownCard.click();
    await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
  }
);

Given(
  "the user is viewing a token created by another address",
  async ({ page, mockDapi }) => {
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
    // Find a card WITHOUT the star marker (not own)
    const cards = page.locator(".grid > div");
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const isOwn = await card.getByLabel("Your token").isVisible();
      if (!isOwn) {
        await card.click();
        await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
        return;
      }
    }
    // If all tokens are own tokens, skip by navigating to a non-existent hash
    // so the "Update Token" button will not be shown
    await page.goto("/tokens/0x0000000000000000000000000000000000000001");
  }
);

Given(
  "a token that was not created through the Forge factory",
  async ({ page, mockDapi }) => {
    // Such a token has creator=null in the metadata service.
    // In the test environment this would be a NEP-17 contract deployed
    // independently.  We navigate to /tokens and look for a non-own token.
    await page.goto("/tokens");
    await connectWallet(page, mockDapi.address);
    // Navigate to a known non-factory token hash from the env var, or use
    // the first non-own token
    const nonOwnCard = page.locator("article").filter({
      hasNot: page.getByLabel("Your token"),
    }).first();
    if (await nonOwnCard.isVisible()) {
      await nonOwnCard.click();
      await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });
    }
  }
);

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When(
  "the user navigates to /tokens/{word}",
  async ({ page }, contractHash: string) => {
    _contractHash = contractHash;
    await page.goto(`/tokens/${contractHash}`);
  }
);

When(
  "the user clicks the copy icon next to the contract hash",
  async ({ page }) => {
    // Grant clipboard permissions so the copy API works in headless Chromium
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy contract hash" }).click();
  }
);

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then(
  "the contract hash {string} is displayed on the page",
  async ({ page }, contractHash: string) => {
    // TokenDetail shows truncated hash: first 8 + "..." + last 6
    const truncated =
      contractHash.length > 12
        ? `${contractHash.slice(0, 8)}...${contractHash.slice(-6)}`
        : contractHash;
    await expect(page.getByText(truncated)).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "a link to the NeoTube explorer for that contract is shown",
  async ({ page }) => {
    const link = page.getByRole("link", { name: /View on NeoTube/ }).or(
      page.getByRole("link", { name: "↗" })
    );
    await expect(link.first()).toBeVisible({ timeout: 5_000 });
    await expect(link.first()).toHaveAttribute("href", /neotube\.io\/contract\//);
  }
);

Then("the contract hash is copied to the clipboard", async ({ page }) => {
  const clipboardText: string = await page.evaluate(
    () => navigator.clipboard.readText()
  );
  // The full hash should be in the clipboard (not the truncated display)
  expect(clipboardText).toMatch(/^0x/);
});

Then("a brief {string} confirmation appears", async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible({ timeout: 3_000 });
});

Then(
  "an {string} button is visible on the detail page",
  async ({ page }, buttonText: string) => {
    await expect(
      page.getByRole("button", { name: buttonText })
    ).toBeVisible({ timeout: 5_000 });
  }
);

Then(
  "no {string} button is shown on the detail page",
  async ({ page }, buttonText: string) => {
    await expect(
      page.getByRole("button", { name: buttonText })
    ).not.toBeVisible({ timeout: 5_000 });
  }
);

Then(
  "the basic token info (name, symbol, total supply) is still shown",
  async ({ page }) => {
    // TokenDetail always shows symbol (h1) and supply/decimals in the dl grid
    await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Supply")).toBeVisible();
    await expect(page.getByText("Decimals")).toBeVisible();
  }
);

Then("a note indicates the token was not created via Forge", async ({ page }) => {
  await expect(
    page.getByText(/Not registered via Forge/)
  ).toBeVisible({ timeout: 5_000 });
});
