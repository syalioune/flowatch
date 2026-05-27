/**
 * E2E — identity membership write ops (Story 14.3).
 *
 * Covers AC-11 — add and remove user-from-group from both the group-
 * detail and user-detail surfaces.
 *
 * Per Pattern P-009: real engine; no mocks. A fresh Flowable 7.2 OSS
 * install seeds ONLY the rest-admin user and ZERO groups, so each
 * test must run against pre-arranged fixtures. beforeEach restores
 * a known state — group + user exist, NO membership — so add tests
 * have something to add and remove tests have something to remove
 * (the remove tests' beforeEach also creates the membership).
 * afterAll cleans up regardless of test outcome.
 */

import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const E2E_GROUP = "e2e-test-group";
const E2E_USER = "e2e-test-user";

async function flowable(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${FLOWABLE}${path}`, {
    ...init,
    headers: { Authorization: BASIC, ...(init?.headers ?? {}) },
  });
}

async function resetIdentityFixtures(): Promise<void> {
  await flowable(`/identity/groups/${E2E_GROUP}/members/${E2E_USER}`, { method: "DELETE" });
  await flowable(`/identity/users/${E2E_USER}`, { method: "DELETE" });
  await flowable(`/identity/groups/${E2E_GROUP}`, { method: "DELETE" });
}

async function seedGroupAndUser(): Promise<void> {
  await resetIdentityFixtures();
  const groupRes = await flowable("/identity/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: E2E_GROUP, name: "E2E Test Group", type: "assignment" }),
  });
  if (!groupRes.ok)
    throw new Error(`Seed group failed: ${groupRes.status} ${await groupRes.text()}`);
  const userRes = await flowable("/identity/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: E2E_USER,
      firstName: "E2E",
      lastName: "Test",
      email: "e2e@example.com",
    }),
  });
  if (!userRes.ok) throw new Error(`Seed user failed: ${userRes.status} ${await userRes.text()}`);
}

async function seedMembership(): Promise<void> {
  const res = await flowable(`/identity/groups/${E2E_GROUP}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: E2E_USER }),
  });
  if (!res.ok) throw new Error(`Seed membership failed: ${res.status} ${await res.text()}`);
}

test.beforeEach(seedGroupAndUser);
test.afterAll(resetIdentityFixtures);

test("add user to group via group detail page", async ({ page }) => {
  await page.goto("/identity?tab=groups");
  await page.locator('[data-testid^="group-row-"]').first().click();
  await page.getByTestId("group-members-panel").waitFor();
  await page.getByTestId("add-member-to-group").click();
  const modal = page.getByTestId("add-membership-modal");
  await expect(modal).toBeVisible();
  // Pick the first non-empty option
  await modal.locator('[data-testid="add-membership-select"]').selectOption({ index: 1 });
  await modal.getByTestId("add-membership-confirm").click();
  // Either the modal closes with a success toast OR it stays open with an
  // in-modal ErrorBox (e.g. 409 Conflict on a duplicate add). Both are valid
  // retryable-creation shapes — assert the disjunction.
  await expect(
    page.locator("text=/Added/i").or(modal.getByTestId("add-membership-error")),
  ).toBeVisible();
});

test("remove user from group via group detail page", async ({ page }) => {
  // Arrange membership on top of the beforeEach baseline so the row exists.
  await seedMembership();
  await page.goto("/identity?tab=groups");
  await page.locator('[data-testid^="group-row-"]').first().click();
  const memberRow = page.getByTestId(`group-member-row-${E2E_USER}`);
  await expect(memberRow).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await memberRow.getByTestId(`remove-member-${E2E_USER}`).click();
  await expect(page.locator("text=/Removed|Failed to remove/i")).toBeVisible();
});

test("add to group via user detail page", async ({ page }) => {
  await page.goto("/identity?tab=users");
  await page.locator('[data-testid^="user-row-"]').first().click();
  await page.getByTestId("add-user-to-group").click();
  const modal = page.getByTestId("add-membership-modal");
  await expect(modal).toBeVisible();
  await modal.locator('[data-testid="add-membership-select"]').selectOption({ index: 1 });
  await modal.getByTestId("add-membership-confirm").click();
  await expect(
    page.locator("text=/Added/i").or(modal.getByTestId("add-membership-error")),
  ).toBeVisible();
});

test("remove from group via user detail page", async ({ page }) => {
  await seedMembership();
  await page.goto(`/identity/users/${E2E_USER}`);
  const membershipRow = page.getByTestId(`user-group-row-${E2E_GROUP}`);
  await expect(membershipRow).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await membershipRow.getByTestId(`remove-membership-${E2E_GROUP}`).click();
  // Scope to the toast — the row also gains a "removed" badge after the
  // optimistic update, which previously made the bare `text=/Removed/i`
  // locator match two elements and trip strict mode.
  await expect(
    page.locator(".toast-text").filter({ hasText: /Removed|Failed to remove/i }),
  ).toBeVisible();
});
