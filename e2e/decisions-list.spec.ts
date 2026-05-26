// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /decisions canonical list (Story 15.1).
 *
 * Goals:
 *   1. `/decisions?tab=decisions` (default) renders against the live engine.
 *   2. `/decisions?tab=deployments` shows the placeholder `Deploy DMN` button.
 *   3. Decision row click navigates to `/decisions/$key`.
 *   4. Placeholder row actions (Test execute) toast the forward-reference.
 *
 * The placeholder-toast assertions on lines `Test execute arrives in Story 15.3`
 * are SWAP POINTS: Story 15.3 drops those assertions when it lands the real
 * modal. Likewise the `Delete DMN deployment arrives in Story 15.2` toast and
 * the `Deploy DMN file arrives in Story 15.2` toast assertions are dropped by
 * Story 15.2 in the same PR.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { expect, test } from "@playwright/test";

test.describe("/decisions canonical list (Story 15.1)", () => {
  test("decisions list renders against live engine", async ({ page }) => {
    await page.goto("/decisions");
    await expect(page.getByTestId("decisions-tabs")).toBeVisible();
    // The default tab is decisions; the seg button should be active.
    const decisionsBtn = page.getByRole("button", { name: "Decisions" }).first();
    await expect(decisionsBtn).toHaveAttribute("data-on", "1");

    // Wait for either the empty state OR at least one row to appear.
    const empty = page.getByTestId("empty-state");
    const rows = page.locator('[data-testid^="decision-row-"]');
    await expect
      .poll(async () => (await empty.isVisible()) || (await rows.count()) > 0, {
        timeout: 15_000,
      })
      .toBeTruthy();
  });

  test("decisions tab switches to deployments tab", async ({ page }) => {
    await page.goto("/decisions");
    await page.getByRole("button", { name: "Deployments" }).first().click();
    await expect(page).toHaveURL(/[?&]tab=deployments/);
    await expect(page.getByTestId("deploy-dmn")).toBeVisible();
  });

  test("decision row click navigates to detail page", async ({ page }) => {
    await page.goto("/decisions");
    const rows = page.locator('[data-testid^="decision-row-"]');
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, "No DMN decisions in the seed engine; deploy one via /dmn first.");
      return;
    }
    await rows.first().locator("td").first().click();
    await expect(page).toHaveURL(/\/decisions\/[^/]+$/);
    await expect(page.getByTestId("test-execute-from-detail")).toBeVisible();
  });

  test("test execute placeholder fires from list-row action menu", async ({ page }) => {
    await page.goto("/decisions");
    const rows = page.locator('[data-testid^="decision-row-"]');
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, "No DMN decisions in the seed engine");
      return;
    }
    const row = rows.first();
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByTestId("test-execute").click();
    await expect(page.locator("text=/Test execute arrives in Story 15.3/")).toBeVisible();
  });

  test("deploy-dmn placeholder fires when clicked", async ({ page }) => {
    await page.goto("/decisions?tab=deployments");
    await expect(page.getByTestId("deploy-dmn")).toBeVisible();
    await page.getByTestId("deploy-dmn").click();
    await expect(page.locator("text=/Deploy DMN file arrives in Story 15.2/")).toBeVisible();
  });
});
