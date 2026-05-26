/**
 * E2E — /identity?tab=users + /identity?tab=groups list + group-detail
 * member listing (Stories 14.1 + 14.2).
 *
 * Per Pattern P-009: real engine; no mocks. The Flowable seed always
 * includes at least the rest-admin user and the admin group.
 *
 * Story 14.1's "Groups tab switches to legacy shim" assertion is
 * REPLACED here with the canonical-archetype assertions per the
 * Placeholder-then-real cleanup discipline (CLAUDE.md).
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

test("identity groups list renders against live engine", async ({ page }) => {
  await page.goto("/identity?tab=groups");
  await expect(page.getByTestId("identity-tabs")).toBeVisible();
  await expect(
    page.getByTestId("identity-tabs").getByRole("button", { name: "Groups" }),
  ).toHaveAttribute("data-active", "1");
  const rows = page.locator('[data-testid^="group-row-"]');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  await expect(page).toHaveURL(/\/identity\/groups\/[^/]+$/);
});

test("group detail renders members panel against live engine", async ({ page }) => {
  await page.goto("/identity?tab=groups");
  // Click the first group row available in the seed
  const rows = page.locator('[data-testid^="group-row-"]');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();
  // Members panel mounts
  await expect(page.getByTestId("group-members-panel")).toBeVisible();
  // At least one member or the empty-state copy renders
  const members = page.locator('[data-testid^="group-member-row-"]');
  const empty = page.getByText("No members in this group.");
  await expect(members.first().or(empty)).toBeVisible();
});
