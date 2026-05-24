// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Delete a deployment via the row-action menu + confirmation modal
 * (Story 9.3).
 *
 * Flow: pre-deploy a fixture BPMN via the REST API (so the test is
 * self-contained, doesn't depend on test execution order), open the
 * Deployments screen, open the ⋮ menu on the new row, click Delete,
 * confirm in the modal, assert the success toast + row disappearance.
 *
 * Per Pattern P-009: real engine; no mocks. The fixture's unique process
 * id (`story-9-2-test-upload`) prevents collisions with other suites.
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

async function uploadTestFixture(): Promise<{ id: string; name: string }> {
  const xml = readFileSync(resolve("e2e/fixtures/test-upload.bpmn"));
  const form = new FormData();
  form.append("deployment", new Blob([xml], { type: "application/xml" }), "test-upload.bpmn");
  const res = await fetch(`${FLOWABLE}/repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) throw new Error(`Fixture deploy failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

test.describe("Delete deployment (Story 9.3)", () => {
  test.beforeEach(deleteTestDeployments);
  test.afterAll(deleteTestDeployments);

  test("deletes a deployment via the confirmation modal", async ({ page }) => {
    const deployment = await uploadTestFixture();

    await page.goto("/deployments");
    const row = page.locator(`tr[data-deployment-id="${deployment.id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Open the ⋮ menu, click Delete.
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    // Modal opens with the deployment name + Delete button. Flowable strips
    // the .bpmn extension server-side, so the modal shows "test-upload".
    const modal = page.locator('[data-testid="delete-deployment-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("test-upload");

    // Submit (cascade unchecked is fine — no running instances).
    await page.locator('[data-testid="delete-confirm"]').click();

    // Modal closes; success toast appears; row disappears.
    await expect(modal).toBeHidden({ timeout: 10_000 });
    // Flowable strips the .bpmn extension server-side.
    await expect(page.getByText(/Deleted: test-upload/)).toBeVisible({ timeout: 10_000 });
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test("Cancel button dismisses the modal without deleting", async ({ page }) => {
    const deployment = await uploadTestFixture();

    await page.goto("/deployments");
    const row = page.locator(`tr[data-deployment-id="${deployment.id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const modal = page.locator('[data-testid="delete-deployment-modal"]');
    await expect(modal).toBeVisible();
    await page.locator('[data-testid="delete-cancel"]').click();
    await expect(modal).toBeHidden();

    // Row is still there.
    await expect(row).toBeVisible();
  });
});
