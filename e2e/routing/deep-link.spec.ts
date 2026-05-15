/**
 * Deep-link / detail-route E2E sanity (Story 3.3).
 *
 * Verifies:
 *  - /deployments/<invalid-id> renders the engine's verbatim 404 via ErrorBox
 *    (Pattern P-003) with a working "back to deployments" link.
 */

import { expect, test } from "@playwright/test";

test("invalid deployment id surfaces ErrorBox + back link", async ({ page }) => {
  await page.goto("/deployments/this-id-does-not-exist");

  // ErrorBox renders the verbatim engine response. Flowable 7.2 typically
  // returns "Could not find a deployment with id 'this-id-does-not-exist'."
  // — match loosely so a phrasing change upstream doesn't break the test.
  await expect(page.getByText(/this-id-does-not-exist/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /back to deployments/i })).toBeVisible();
});
