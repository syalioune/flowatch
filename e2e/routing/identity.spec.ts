/**
 * Identity / users / groups routing E2E (Story 3.5).
 *
 * Verifies:
 *  - /identity?tab=users → row click navigates to /identity/users/$id.
 *  - /identity/users/<invalid> renders the verbatim 404 via ErrorBox.
 */

import { expect, test } from "@playwright/test";

test("identity user detail is reachable via row click", async ({ page }) => {
  await page.goto("/identity?tab=users");
  // The first row in the users table.
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 15_000 });
  await firstRow.click();
  await expect(page).toHaveURL(/\/identity\/users\//);
});

test("invalid user id renders ErrorBox + back link", async ({ page }) => {
  await page.goto("/identity/users/this-user-does-not-exist");
  await expect(page.getByText(/this-user-does-not-exist/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: /back to identity/i })).toBeVisible();
});
