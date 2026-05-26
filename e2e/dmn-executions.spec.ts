// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — DMN executions tab + row-expand (Story 15.4).
 *
 * Goals:
 *   1. `/decisions?tab=executions` renders against the live engine.
 *   2. Clicking a row expands input + output panels inline below.
 *   3. Single-expand invariant — clicking a second row collapses the first.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { expect, test } from "@playwright/test";

test.describe("DMN executions tab (Story 15.4)", () => {
  test("executions tab renders against live engine", async ({ page }) => {
    await page.goto("/decisions?tab=executions");
    await expect(page.getByTestId("decisions-tabs")).toBeVisible();
    const executionsBtn = page.getByRole("button", { name: "Executions" }).first();
    await expect(executionsBtn).toHaveAttribute("data-on", "1");

    const empty = page.getByTestId("empty-state");
    const rows = page.locator('[data-testid^="execution-row-"]');
    await expect
      .poll(async () => (await empty.isVisible()) || (await rows.count()) > 0, {
        timeout: 15_000,
      })
      .toBeTruthy();
  });

  test("execution row click expands the detail panel", async ({ page }) => {
    await page.goto("/decisions?tab=executions");
    const rows = page.locator('[data-testid^="execution-row-"]');
    if ((await rows.count()) === 0) {
      test.skip(
        true,
        "No DMN executions in seed engine; trigger one via /decisions test-execute first",
      );
      return;
    }
    const first = rows.first();
    await first.click();
    const detail = page.locator('[data-testid^="execution-detail-"]').first();
    await expect(detail).toBeVisible();
    await expect(detail.locator("text=/Input variables/i")).toBeVisible();
    await expect(detail.locator("text=/Output variables/i")).toBeVisible();
  });

  test("single-expand invariant: clicking a second row collapses the first", async ({ page }) => {
    await page.goto("/decisions?tab=executions");
    const rows = page.locator('[data-testid^="execution-row-"]');
    if ((await rows.count()) < 2) {
      test.skip(true, "Need at least 2 executions in seed engine");
      return;
    }
    await rows.first().click();
    const firstDetail = page.locator('[data-testid^="execution-detail-"]').first();
    await expect(firstDetail).toBeVisible();
    await rows.nth(1).click();
    // The first detail collapses; another detail appears.
    await expect
      .poll(async () => page.locator('[data-testid^="execution-detail-"]').count())
      .toBe(1);
  });
});
