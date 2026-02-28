/**
 * Step definitions for: update-token.feature
 */

import { createBdd } from "playwright-bdd";
import { test, expect } from "../fixtures/mock-dapi";
import { connectWallet } from "./common.steps";

const { Given, When, Then } = createBdd(test);

async function dismissAdminHintIfVisible(
  page: import("@playwright/test").Page
): Promise<void> {
  const overlay = page.getByTestId("admin-update-hint-overlay");
  if (await overlay.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const ok = page.getByRole("button", { name: "OK" });
    if (await ok.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await ok.click();
    } else {
      await page.keyboard.press("Escape").catch(() => {});
    }
    await expect(overlay).toHaveCount(0, { timeout: 5_000 });
  }
}

async function forgeOwnTokenAndOpenDetail(
  page: import("@playwright/test").Page,
  address: string
): Promise<void> {
  await page.goto("/tokens");
  await connectWallet(page, address);
  await expect(page.getByLabel("Your token").first()).toBeVisible({ timeout: 10_000 });
  await page.getByLabel("Your token").first().click();
  await page.waitForURL(/\/tokens\/0x/, { timeout: 10_000 });

  const ok = page.getByRole("button", { name: "OK" });
  if (await ok.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await ok.click();
  }
  await dismissAdminHintIfVisible(page);

  await expect(page.getByText("TOKEN ADMINISTRATION")).toBeVisible({ timeout: 10_000 });
}

Given(
  "the user is on the detail page of their own upgradeable token",
  async ({ page, mockDapi }) => {
    await forgeOwnTokenAndOpenDetail(page, mockDapi.address);
  }
);


When("the user updates the image URL field in the Identity tab", async ({ page }) => {
  await dismissAdminHintIfVisible(page);
  await page.getByRole("tab", { name: "Identity" }).click();
  const input = page.getByRole("textbox", { name: "Image URL" });
  await input.fill("https://example.com/new-image.png");
});

When("the user clicks Stage for the identity change", async ({ page }) => {
  await page
    .locator("section[aria-label='Admin Identity Tab']")
    .getByRole("button", { name: "Stage" })
    .click();
});

Then("the Token Administration panel is visible", async ({ page }) => {
  await expect(page.getByText("TOKEN ADMINISTRATION")).toBeVisible({ timeout: 10_000 });
});

Then(
  "the panel shows tabs Identity, Supply, Properties, and Danger Zone",
  async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Identity" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Supply" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Properties" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("tab", { name: "Danger Zone" })).toBeVisible({ timeout: 10_000 });
  }
);

Then(
  "the staged changes list contains an image URL update entry",
  async ({ page }) => {
    await expect(page.getByText("STAGED CHANGES (1)")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("span[title='Update image URL']").first()
    ).toBeVisible({ timeout: 10_000 });
  }
);
