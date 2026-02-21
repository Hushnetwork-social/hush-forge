/**
 * Step definitions for: forge-rejection.feature
 *
 * Shared steps (Forge overlay open, WaitingOverlay active, user remains on
 * /tokens dashboard) are in common.steps.ts.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given("the mock wallet is set to reject mode", async ({ mockDapi }) => {
  await mockDapi.setRejectMode(true);
});

/**
 * Intercepts the RPC isInitialized call so the factory appears deployed
 * but NOT yet initialized — simulating a partial setup by the operator.
 *
 * Uses page.route() to intercept browser-side fetch calls to the Neo RPC.
 * The interception persists through page.reload() (same browser context).
 */
Given(
  "the factory is deployed but its initialization is incomplete",
  async ({ page }) => {
    // Intercept the Next.js RPC proxy (browser sends to /api/rpc which is proxied
    // server-side to localhost:10332). Intercept POST here and return false for
    // isInitialized; pass everything else through to the real chain.
    await page.route(/\/api\/rpc/, async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        let body: Record<string, unknown> = {};
        try { body = JSON.parse(req.postData() ?? "{}"); } catch { /* ignore */ }
        if (
          body.method === "invokefunction" &&
          Array.isArray(body.params) &&
          body.params[1] === "isInitialized"
        ) {
          await route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: (body.id as number) ?? 1,
              result: {
                state: "HALT",
                gasconsumed: "0",
                stack: [{ type: "Boolean", value: false }],
              },
            }),
          });
          return;
        }
      }
      await route.continue();
    });

    await page.goto("/tokens");
  }
);

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When("the user clicks FORGE", async ({ page }) => {
  await page.getByRole("button", { name: /FORGE/ }).click();
});

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then(
  "an inline error message appears: {string}",
  async ({ page }, message: string) => {
    // Scope to the Forge dialog to avoid matching other alerts on the page
    const dialog = page.getByRole("dialog", { name: "Forge a Token" });
    await expect(dialog.getByRole("alert")).toContainText(message, {
      timeout: 5_000,
    });
  }
);

Then("the form values are preserved", async ({ page }) => {
  // Symbol field should still show the value entered before rejection
  const symbolInput = page.getByLabel(/^Symbol/);
  await expect(symbolInput).not.toHaveValue("");
});

Then("the user remains on the Forge overlay", async ({ page }) => {
  await expect(
    page.getByRole("dialog", { name: "Forge a Token" })
  ).toBeVisible();
});

Then("a warning banner explains the factory needs initialization", async ({ page }) => {
  await expect(
    page.getByText("TokenFactory needs initialization")
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByText(/factory contract is deployed but has not been loaded with the TokenTemplate/)
  ).toBeVisible({ timeout: 5_000 });
});

Then(
  "an {string} action button is shown",
  async ({ page }, buttonLabel: string) => {
    await expect(
      page.getByRole("button", { name: buttonLabel })
    ).toBeVisible({ timeout: 5_000 });
  }
);

Then("the Forge Token button is disabled", async ({ page }) => {
  // Button is visible (wallet connected) but disabled until factory is ready
  await expect(
    page.getByRole("button", { name: /Forge Token/ })
  ).toBeDisabled({ timeout: 5_000 });
});
