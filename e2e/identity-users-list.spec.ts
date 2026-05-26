/**
 * E2E — /identity?tab=users + /identity?tab=groups list + group-detail
 * member listing (Stories 14.1 + 14.2).
 *
 * Per Pattern P-009: real engine; no mocks. A fresh Flowable 7.2 OSS
 * install seeds ONLY the rest-admin user and ZERO groups, so the
 * groups-list and group-detail tests must arrange their own fixtures.
 * beforeAll creates `e2e-test-group` + `e2e-test-user` and binds them
 * via the group-centric membership endpoint (the only one 7.2 OSS
 * honours — see docs/api-contracts.md Identity table). afterAll
 * cleans up regardless of test outcome.
 *
 * Story 14.1's "Groups tab switches to legacy shim" assertion is
 * REPLACED here with the canonical-archetype assertions per the
 * Placeholder-then-real cleanup discipline (CLAUDE.md).
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
  // Idempotent teardown — DELETE returns 404 if missing; we don't care.
  await flowable(`/identity/groups/${E2E_GROUP}/members/${E2E_USER}`, { method: "DELETE" });
  await flowable(`/identity/users/${E2E_USER}`, { method: "DELETE" });
  await flowable(`/identity/groups/${E2E_GROUP}`, { method: "DELETE" });
}

async function seedIdentityFixtures(): Promise<void> {
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
  const memberRes = await flowable(`/identity/groups/${E2E_GROUP}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: E2E_USER }),
  });
  if (!memberRes.ok)
    throw new Error(`Seed membership failed: ${memberRes.status} ${await memberRes.text()}`);
}

test.beforeAll(seedIdentityFixtures);
test.afterAll(resetIdentityFixtures);

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
