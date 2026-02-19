/**
 * Step definitions for: forge-rejection.feature
 *
 * Shared steps (Forge overlay open, WaitingOverlay active, user remains on
 * /tokens dashboard) are in common.steps.ts.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";

const { Given, When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// Given
// ---------------------------------------------------------------------------

Given("the mock wallet is set to reject mode", async ({ mockDapi }) => {
  await mockDapi.setRejectMode(true);
});

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

When("the user clicks FORGE", async ({ page }) => {
  await page.getByRole("button", { name: /FORGE/ }).click();
});

When(
  "the transaction fails with a FAULT state on-chain",
  async ({ page }) => {
    // In a real devnet test this would require the TX to fault on-chain.
    // We simulate by observing the polling hook detecting a "faulted" status,
    // which the useTokenPolling hook emits when the RPC confirms FAULT.
    // The WaitingOverlay closes and ForgeErrorToast appears.
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).not.toBeVisible({ timeout: 60_000 });
  }
);

When(
  "the transaction polling times out after the configured interval",
  async ({ page }) => {
    // Polling timeout triggers when TX_POLLING_TIMEOUT_MS elapses.
    // In dev/test, TX_POLLING_TIMEOUT_MS can be set to a small value.
    // We wait for the WaitingOverlay to close.
    await expect(
      page.getByRole("status", { name: "Waiting for transaction" })
    ).not.toBeVisible({ timeout: 60_000 });
  }
);

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then(
  "an inline error message appears: {string}",
  async ({ page }, message: string) => {
    await expect(page.getByRole("alert")).toContainText(message, {
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

Then("the WaitingOverlay closes", async ({ page }) => {
  await expect(
    page.getByRole("status", { name: "Waiting for transaction" })
  ).not.toBeVisible({ timeout: 15_000 });
});

Then("an error toaster appears at bottom-right", async ({ page }) => {
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
  // ForgeErrorToast is fixed bottom-right — verify it contains the error heading
  await expect(page.getByText("⚠ Transaction Failed")).toBeVisible();
});

Then(
  "the toaster shows a NeoTube link to the failed transaction",
  async ({ page }) => {
    const link = page.getByRole("link", { name: /View on NeoTube/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", /neotube\.io\/transaction\//);
  }
);

Then(
  "an error toaster appears: {string}",
  async ({ page }, message: string) => {
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(message)).toBeVisible();
  }
);
