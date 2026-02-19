/**
 * Step definitions for: accessibility.feature
 *
 * Validates keyboard navigation, ARIA roles, and accessible labels.
 * These steps run in headless Chromium with full keyboard event support.
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";

const { When, Then } = createBdd(test);

// ---------------------------------------------------------------------------
// When
// ---------------------------------------------------------------------------

// (navigation and wallet setup steps are in common.steps.ts)

// ---------------------------------------------------------------------------
// Then
// ---------------------------------------------------------------------------

Then("keyboard focus is trapped inside the Forge overlay", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Forge a Token" });
  await expect(dialog).toBeVisible();

  // Tab through all focusable elements — focus must not leave the dialog
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    // The focused element must be a descendant of the dialog
    const focusedOutside = await page.evaluate(() => {
      const active = document.activeElement;
      const dialog = document.querySelector('[aria-label="Forge a Token"]');
      return active && dialog ? !dialog.contains(active) : false;
    });
    expect(focusedOutside).toBe(false);
  }
});

Then("pressing Escape closes the overlay", async ({ page }) => {
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Forge a Token" })
  ).not.toBeVisible({ timeout: 3_000 });
});

Then("the overlay has role status and is polite", async ({ page }) => {
  // WaitingOverlay uses role="status" which implies aria-live="polite"
  const overlay = page.getByRole("status", { name: "Waiting for transaction" });
  await expect(overlay).toBeVisible();
  // role="status" implicitly sets aria-live="polite"
  const role = await overlay.getAttribute("role");
  expect(role).toBe("status");
});

Then("the overlay has an accessible label", async ({ page }) => {
  const overlay = page.getByRole("status", { name: "Waiting for transaction" });
  await expect(overlay).toBeVisible();
  // Accessible name is provided via aria-label
  const label = await overlay.getAttribute("aria-label");
  expect(label).toBeTruthy();
});

Then(
  "every icon-only button has an aria-label attribute",
  async ({ page }) => {
    // Collect all buttons that contain only an icon (no visible text)
    // These should all have aria-label set
    const buttonHandles = await page.getByRole("button").all();
    for (const btn of buttonHandles) {
      const text = (await btn.innerText()).trim();
      const ariaLabel = await btn.getAttribute("aria-label");
      const ariaLabelledBy = await btn.getAttribute("aria-labelledby");
      const isAccessible = text.length > 0 || ariaLabel || ariaLabelledBy;
      expect(
        isAccessible,
        `Button with text "${text}" has no accessible label`
      ).toBeTruthy();
    }
  }
);
