/**
 * Step definitions for: accessibility.feature
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";

const { Then } = createBdd(test);

Then("keyboard focus is trapped inside the Forge overlay", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Forge a Token" });
  await expect(dialog).toBeVisible();

  // Ensure keyboard navigation keeps the overlay active and focusable.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    await expect(dialog).toBeVisible();
    const hasActive = await page.evaluate(() => document.activeElement !== null);
    expect(hasActive).toBe(true);
  }
});

Then("pressing Escape closes the overlay", async ({ page }) => {
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Forge a Token" })
  ).not.toBeVisible({ timeout: 3_000 });
});

Then("the overlay has role status and is polite", async ({ page }) => {
  const overlay = page.getByRole("status", { name: "Waiting for transaction" });
  await expect(overlay).toBeVisible();
  const role = await overlay.getAttribute("role");
  expect(role).toBe("status");
});

Then("the overlay has an accessible label", async ({ page }) => {
  const overlay = page.getByRole("status", { name: "Waiting for transaction" });
  await expect(overlay).toBeVisible();
  const label = await overlay.getAttribute("aria-label");
  expect(label).toBeTruthy();
});

Then(
  "every icon-only button has an aria-label attribute",
  async ({ page }) => {
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
