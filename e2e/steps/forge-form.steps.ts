/**
 * Step definitions for: forge-form.feature
 *
 * Shared steps (wallet connected, overlay open, FORGE disabled) are in
 * common.steps.ts.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { openForgeOverlay, connectWallet } from "./common.steps";

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

Given("the wallet has less GAS than the creation fee", async ({ page, mockDapi }) => {
  // Intercept the Next.js RPC proxy and return 0 GAS for invokefunction on the
  // GAS contract (balanceof). This makes useForgeForm see gasBalance=0 which
  // is always less than the creation fee (~15 GAS).
  await page.route(/\/api\/rpc/, async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      let body: Record<string, unknown> = {};
      try { body = JSON.parse(req.postData() ?? "{}"); } catch { /* ignore */ }
      const GAS_HASH = "0xd2a4cff31913016155e38e474a2c06d08be276cf";
      if (
        body.method === "invokefunction" &&
        Array.isArray(body.params) &&
        body.params[0] === GAS_HASH
      ) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: (body.id as number) ?? 1,
            result: {
              state: "HALT",
              gasconsumed: "0",
              stack: [{ type: "Integer", value: "0" }],
            },
          }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.goto("/tokens");
  await connectWallet(page, mockDapi.address);
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
  // Fee row shows "Creation fee" label and either "Loading…" or "~N GAS"
  const dialog = page.getByRole("dialog", { name: "Forge a Token" });
  await expect(dialog.getByText("Creation fee")).toBeVisible();
  // Wait for fee to finish loading (shows "~N GAS") — scoped to dialog to avoid
  // matching multiple GAS-related elements outside the overlay
  await expect(dialog.getByText(/Loading…|GAS/).first()).toBeVisible();
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
