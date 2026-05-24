// SPDX-License-Identifier: Apache-2.0

/**
 * E2E: ErrorBox → API Inspector handoff (Story 8.2 retro A-4 critical path).
 *
 * Navigates to a detail route guaranteed to 404 against the live engine,
 * then exercises the upgraded ErrorBox button: assert the box renders,
 * the data-testid hooks are present, clicking the button opens the drawer,
 * the "Recent calls" tab activates, and at least one log entry is visible.
 *
 * The focused-row attribute (data-focused="1") may have already faded by
 * the time Playwright queries — the test accepts either "still present" OR
 * "drawer is in calls tab with a visible row" per AC-8 / T-11.3.
 *
 * Per Pattern P-009: real engine calls; no mocks.
 */

import { expect, test } from "@playwright/test";

test.describe("ErrorBox → Inspector handoff (Story 8.2)", () => {
  test("clicking Open Inspector inside an ErrorBox opens the drawer on the Recent calls tab", async ({
    page,
  }) => {
    const nonExistentId = `nonexistent-pi-${Math.random().toString(36).slice(2, 10)}`;
    await page.goto(`/instances/${nonExistentId}`);

    // The detail route's loader will throw a FlowableError, which the
    // errorComponent renders via <ErrorBox/>. data-testid="error-box" is the
    // 8.2 contract.
    const errorBox = page.locator('[data-testid="error-box"]');
    await expect(errorBox).toBeVisible({ timeout: 10_000 });

    const openBtn = page.locator('[data-testid="open-inspector"]');
    await expect(openBtn).toBeVisible();
    await openBtn.click();

    // Drawer opens with data-open="1"; Recent calls tab becomes active; at
    // least one row is rendered (the failed GET that produced the 404).
    await expect(page.locator('.drawer[data-open="1"]')).toBeVisible();
    await expect(page.locator('.tab[data-active="1"]')).toHaveText(/Recent calls/);
    await expect(page.locator(".log-entry").first()).toBeVisible({ timeout: 5_000 });
  });
});
