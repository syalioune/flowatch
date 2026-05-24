// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /deployments canonical list archetype (Story 9.1).
 *
 * Goals:
 *   1. The route renders the table once the live engine responds.
 *   2. The `⋮` row-action menu opens and is keyboard-navigable.
 *   3. Escape closes the menu and restores focus to the trigger.
 *
 * We deliberately DO NOT click any Delete menu item: destroying the seeded
 * deployment would break sibling E2E tests that depend on it. A fresh
 * upload→delete cycle lands once Story 9.2 + 9.3 ship.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

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

async function deleteTestDeployments(): Promise<void> {
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

test.describe("/deployments canonical list (Story 9.1)", () => {
  test.beforeAll(async () => {
    await deleteTestDeployments();
    await uploadFixture();
  });
  test.afterAll(deleteTestDeployments);

  test("renders at least one row and exposes a keyboard-accessible action menu", async ({
    page,
  }) => {
    await page.goto("/deployments");

    // The table appears once the loader resolves — wait for a `[data-deployment-id]`
    // row to materialise rather than a generic table selector so we know the data
    // tier (not just the pending tier) is rendered.
    const firstRow = page.locator("tr[data-deployment-id]").first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });

    // The Actions column hosts the new `⋮` trigger.
    const trigger = firstRow.locator('[data-testid="row-action-trigger"]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-haspopup", "menu");

    // Open the menu via click and verify the Delete item renders (Story 9.3
    // collapsed the two-item cascade variants into a single Delete item that
    // opens a styled confirmation modal).
    await trigger.click();
    const menu = page.locator('[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();

    // Escape closes the menu and restores focus to the trigger (AC-6).
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Upload button opens the upload-deployment modal (Story 9.2)", async ({ page }) => {
    await page.goto("/deployments");
    // Page chrome stays consistent across pending/data — wait for the Upload
    // button to become enabled (i.e. the data tier is reached).
    const upload = page.locator('[data-testid="upload-deployment"]');
    await expect(upload).toBeEnabled({ timeout: 15_000 });
    await upload.click();
    // Story 9.2 replaced the 9.1 placeholder toast with a real modal.
    await expect(page.locator('[data-testid="upload-deployment-modal"]')).toBeVisible();
  });
});
