// SPDX-License-Identifier: Apache-2.0

/**
 * E2E: Dashboard partial-failure contract (NFR-6).
 *
 * Story 7.4 commits the Dashboard to per-tile state handling: when one of
 * the four API calls fails, the other three tiles still render data and
 * NO top-level <ErrorBox> appears anywhere on the page.
 *
 * This test intercepts the /management/jobs?withException=true call with
 * page.route() and returns HTTP 500 with a synthetic engine body. It then
 * navigates to / and asserts:
 *   - tiles 0/2/3 (instances, tasks, deployments) show a non-"—" value
 *   - tile 1 (failing jobs) shows .badge[data-tone="bad"]
 *   - no .error-box / .empty element with the verbatim ErrorBox shape
 *     appears anywhere in the page
 *
 * Per Pattern P-009: the real api.listJobs() request() funnel is exercised
 * — only the network response is synthetic. No vi.mock() at the module
 * level.
 *
 * See: _bmad-output/planning-artifacts/architecture.md#nfr-6
 */

import { expect, test } from "@playwright/test";

test.describe("Dashboard partial failure (NFR-6)", () => {
  test("three tiles render data when the jobs endpoint returns 500", async ({ page }) => {
    // Intercept Flowable's failing-jobs call at the proxy layer (the Vite dev
    // server proxies /flowable-rest/* to the engine). Matches by pathname +
    // query so other /management/* calls are untouched.
    await page.route(
      (url) =>
        url.pathname.includes("/management/jobs") &&
        url.searchParams.get("withException") === "true",
      (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Simulated failure: jobs endpoint synthetic 500 for NFR-6 test",
          }),
        }),
    );

    await page.goto("/");

    const tiles = page.locator(".kpi-grid > .kpi");
    await expect(tiles).toHaveCount(4);

    // Tile 0 — Running instances: real data (or "0") — never "—" alone.
    const instancesVal = tiles.nth(0).locator(".kpi-val");
    await expect(instancesVal).not.toHaveText("—", { timeout: 15_000 });

    // Tile 1 — Failing jobs: error badge visible.
    const jobsBadge = tiles.nth(1).locator('.badge[data-tone="bad"]');
    await expect(jobsBadge).toBeVisible({ timeout: 15_000 });

    // Tile 2 — My tasks: real data.
    const tasksVal = tiles.nth(2).locator(".kpi-val");
    await expect(tasksVal).not.toHaveText("—", { timeout: 15_000 });

    // Tile 3 — Deployments: real data.
    const deploysVal = tiles.nth(3).locator(".kpi-val");
    await expect(deploysVal).not.toHaveText("—", { timeout: 15_000 });

    // No top-level ErrorBox per AC-8. Defense in depth:
    //   1. The literal selectors AC-8 names ('.error-box' / '[data-testid="error-box"]').
    //      If a future contributor adds a top-level ErrorBox to the route, the
    //      idiomatic class would be one of these.
    //   2. The Story 8.2 Inspector-link button only appears inside ErrorBox;
    //      its absence proves no ErrorBox was rendered. (Story 7.3's placeholder
    //      `<span title="Available once the API Inspector is wired …">` was
    //      removed by 8.2 when the hint was upgraded to a real button.)
    //   3. The kpi-grid is still the page's primary surface (proves the route
    //      didn't fall back to a single error screen).
    await expect(page.locator(".error-box")).toHaveCount(0);
    await expect(page.locator('[data-testid="error-box"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="open-inspector"]')).toHaveCount(0);
    await expect(page.locator(".kpi-grid")).toBeVisible();
  });
});
