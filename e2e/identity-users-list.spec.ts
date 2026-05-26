/**
 * E2E — /identity?tab=users list + tab switching (Story 14.1).
 *
 * Per Pattern P-009: real engine; no mocks. The Flowable seed always
 * includes at least the rest-admin user so the data-state assertion
 * is deterministic.
 *
 * The 14.1-only assertion "Groups tab switches to legacy shim" is
 * REPLACED in Story 14.2's E2E extension (per the Placeholder-then-real
 * cleanup discipline at CLAUDE.md).
 */

import { expect, test } from "@playwright/test";

test("identity users list renders against live engine", async ({ page }) => {
  await page.goto("/identity?tab=users");
  await expect(page.getByTestId("identity-tabs")).toBeVisible();
  // Users tab is active by default
  await expect(
    page.getByTestId("identity-tabs").getByRole("button", { name: "Users" }),
  ).toHaveAttribute("data-active", "1");
  // At least one user row renders (Flowable seed includes rest-admin)
  const rows = page.locator('[data-testid^="user-row-"]');
  await expect(rows.first()).toBeVisible();
  // Click navigates to the user detail
  await rows.first().click();
  await expect(page).toHaveURL(/\/identity\/users\/[^/]+$/);
});

test("identity groups tab switches to legacy shim", async ({ page }) => {
  await page.goto("/identity?tab=users");
  await page.getByTestId("identity-tabs").getByRole("button", { name: "Groups" }).click();
  await expect(page).toHaveURL(/\?tab=groups/);
  // Legacy `<Identity>` body renders its own table; either rows or an
  // empty state are visible. (14.2 replaces this assertion with a
  // canonical-archetype assertion identical to the users tab.)
  await expect(page.locator(".tbl").or(page.locator(".empty"))).toBeVisible();
});
