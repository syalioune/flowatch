// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /deployments canonical list archetype (Story 9.1).
 *
 * Goals:
 *   1. The route renders the table once the live engine responds.
 *   2. The `⋮` row-action menu opens and is keyboard-navigable.
 *   3. Escape closes the menu and restores focus to the trigger.
 *
 * We deliberately DO NOT click any Delete menu item: destroying the seeded
 * deployment would break sibling E2E tests that depend on it. A fresh
 * upload→delete cycle lands once Story 9.2 + 9.3 ship.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { expect, test } from "@playwright/test";

test.describe("/deployments canonical list (Story 9.1)", () => {
  test("renders at least one row and exposes a keyboard-accessible action menu", async ({
    page,
  }) => {
    await page.goto("/deployments");

    // The table appears once the loader resolves — wait for a `[data-deployment-id]`
    // row to materialise rather than a generic table selector so we know the data
    // tier (not just the pending tier) is rendered.
    const firstRow = page.locator("tr[data-deployment-id]").first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    // The Actions column hosts the new `⋮` trigger.
    const trigger = firstRow.locator('[data-testid="row-action-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    // Open the menu via click and verify both Delete items render.
    await trigger.click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete (cascade)" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete (no cascade)" })).toBeVisible();

    // Escape closes the menu and restores focus to the trigger (AC-6).
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Upload button shows the Story-9.2 placeholder toast", async ({ page }) => {
    await page.goto("/deployments");
    // Page chrome stays consistent across pending/data — wait for the Upload
    // button to become enabled (i.e. the data tier is reached).
    const upload = page.locator('[data-testid="upload-deployment"]');
    await expect(upload).toBeEnabled({ timeout: 15_000 });
    await upload.click();
    await expect(page.getByText(/Upload arrives in Story 9.2/)).toBeVisible();
  });
});
