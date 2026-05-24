// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /definitions list with optimistic suspend/activate (Story 9.4).
 *
 * Uploads a fixture BPMN, navigates to /definitions, asserts the row
 * appears with the "active" badge, opens the ⋮ menu, clicks Suspend,
 * asserts the badge flips immediately (optimistic), waits for the
 * success toast, reloads, asserts the badge stays "suspended" (engine
 * state confirmed), then Activates again and cleans up the deployment.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function deleteTestDeployments() {
  const res = await fetch(`${FLOWABLE}/repository/deployments?name=test-upload.bpmn&size=100`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as { data: Array<{ id: string }> };
  for (const dep of body.data) {
    await fetch(`${FLOWABLE}/repository/deployments/${dep.id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

async function uploadFixture(): Promise<void> {
  const xml = readFileSync(resolve("e2e/fixtures/test-upload.bpmn"));
  const form = new FormData();
  form.append("deployment", new Blob([xml], { type: "application/xml" }), "test-upload.bpmn");
  const res = await fetch(`${FLOWABLE}/repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) throw new Error(`Fixture deploy failed: ${res.status} ${await res.text()}`);
}

test.describe("/definitions suspend/activate (Story 9.4)", () => {
  test.beforeAll(async () => {
    await deleteTestDeployments();
    await uploadFixture();
  });
  test.afterAll(deleteTestDeployments);

  test("toggles suspend/activate with optimistic UI + verbatim engine confirmation", async ({
    page,
  }) => {
    await page.goto("/definitions");

    // Find the row for the test fixture's process id.
    const row = page.locator('tr[data-definition-id^="story-9-2-test-upload"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Initial state: active.
    await expect(row.locator(".badge")).toHaveText(/active/);

    // Open the ⋮ menu and click Suspend.
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Suspend" }).click();

    // Optimistic UI: badge flips immediately to "suspended".
    await expect(row.locator(".badge")).toHaveText(/suspended/, { timeout: 2000 });

    // Success toast (engine confirmed).
    await expect(page.getByText(/Suspended:/)).toBeVisible({ timeout: 10_000 });

    // Reload — state persists.
    await page.reload();
    const reloadedRow = page.locator('tr[data-definition-id^="story-9-2-test-upload"]').first();
    await expect(reloadedRow.locator(".badge")).toHaveText(/suspended/, { timeout: 15_000 });

    // Activate again.
    await reloadedRow.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Activate" }).click();
    await expect(reloadedRow.locator(".badge")).toHaveText(/active/, { timeout: 5000 });
    await expect(page.getByText(/Activated:/)).toBeVisible({ timeout: 10_000 });
  });

  test("Start instance menu item shows the Story 10.2 placeholder toast", async ({ page }) => {
    await page.goto("/definitions");
    const row = page.locator('tr[data-definition-id^="story-9-2-test-upload"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Start instance" }).click();
    await expect(page.getByText(/Start instance arrives in Story 10\.2/)).toBeVisible();
  });
});
