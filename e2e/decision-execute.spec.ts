// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — execute decision flow (Story 15.3).
 *
 * Goals:
 *   1. Test execute action on a list row opens `<ExecuteDecisionModal>`.
 *   2. The detail page's Test execute button opens the modal.
 *   3. Malformed JSON surfaces the inline parse error and does NOT submit.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { expect, test } from "@playwright/test";

test.describe("DMN test execute (Story 15.3)", () => {
  test("execute decision from list-row action menu", async ({ page }) => {
    await page.goto("/decisions");
    const rows = page.locator('[data-testid^="decision-row-"]');
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, "No DMN decisions in seed engine");
      return;
    }
    const row = rows.first();
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByTestId("test-execute").click();
    const modal = page.getByTestId("execute-decision-modal");
    await expect(modal).toBeVisible();
    // Default input is {} — close without submitting.
    await modal.getByRole("button", { name: "Close" }).click();
    await expect(modal).not.toBeVisible();
  });

  test("execute decision from detail page", async ({ page }) => {
    await page.goto("/decisions");
    const rows = page.locator('[data-testid^="decision-row-"]');
    if ((await rows.count()) === 0) {
      test.skip(true, "No DMN decisions in seed engine");
      return;
    }
    await rows.first().locator("td").first().click();
    await page.getByTestId("test-execute-from-detail").click();
    const modal = page.getByTestId("execute-decision-modal");
    await expect(modal).toBeVisible();
  });

  test("JSON parse error is surfaced inline", async ({ page }) => {
    await page.goto("/decisions");
    const rows = page.locator('[data-testid^="decision-row-"]');
    if ((await rows.count()) === 0) {
      test.skip(true, "No DMN decisions");
      return;
    }
    await rows.first().locator('[data-testid="row-action-trigger"]').click();
    await page.getByTestId("test-execute").click();
    const modal = page.getByTestId("execute-decision-modal");
    await expect(modal).toBeVisible();
    const input = modal.getByTestId("execute-decision-input");
    await input.fill("{ invalid json");
    await modal.getByTestId("execute-decision-submit").click();
    await expect(modal.getByTestId("json-parse-error")).toBeVisible();
  });
});
