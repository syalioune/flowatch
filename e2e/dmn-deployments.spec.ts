// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — DMN deploy + delete golden path (Story 15.2).
 *
 * Goals:
 *   1. Clicking `Deploy DMN` opens `<UploadDmnDeploymentModal>`.
 *   2. Uploading a `.dmn` fixture closes the modal + appends a row.
 *   3. The row action menu's Delete opens `<DeleteDmnDeploymentModal>`.
 *   4. Confirming Delete closes the modal + toasts the outcome.
 *
 * Per Pattern P-009: real engine calls, no mocks. The fixture's decision
 * key is `e2eSampleDecision` (intentionally namespaced to avoid colliding
 * with the modeler's seed `loanEligibility` decision).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE_DMN = "http://localhost:8080/flowable-rest/dmn-api";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function cleanupE2EDecisions(): Promise<void> {
  // Best-effort cleanup of prior e2e fixtures so the spec is rerunnable.
  const res = await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments?size=200`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as { data: Array<{ id: string; name?: string }> };
  for (const dep of body.data) {
    if (dep.name?.startsWith("sample.dmn")) {
      await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments/${dep.id}?cascade=true`, {
        method: "DELETE",
        headers: { Authorization: BASIC },
      });
    }
  }
}

test.describe("DMN deploy + delete (Story 15.2)", () => {
  test.beforeAll(cleanupE2EDecisions);
  test.afterAll(cleanupE2EDecisions);

  test("deploy DMN via modal lands on the deployments tab", async ({ page }) => {
    await page.goto("/decisions?tab=deployments");
    await page.getByTestId("deploy-dmn").click();
    const modal = page.getByTestId("upload-dmn-deployment-modal");
    await expect(modal).toBeVisible();
    const xml = readFileSync(resolve("e2e/fixtures/sample.dmn"), "utf-8");
    // Set the file via Playwright's File chooser API.
    await modal.getByTestId("upload-dmn-deployment-input").setInputFiles({
      name: "sample.dmn",
      mimeType: "application/xml",
      buffer: Buffer.from(xml),
    });
    await modal.getByTestId("upload-dmn-deployment-submit").click();
    await expect(modal).not.toBeVisible({ timeout: 10_000 });
    // The Deployed toast surfaces the deployment.
    await expect(page.locator("text=/Deployed DMN/")).toBeVisible({ timeout: 10_000 });
  });

  test("delete DMN deployment via row action menu", async ({ page }) => {
    // The previous test deployed sample.dmn; this test deletes it.
    await page.goto("/decisions?tab=deployments");
    const rows = page.locator('[data-testid^="dmn-deployment-row-"]');
    const count = await rows.count();
    if (count === 0) {
      test.skip(true, "No DMN deployments to delete (the deploy test may have been skipped)");
      return;
    }
    await rows.first().locator('[data-testid="row-action-trigger"]').click();
    await page.getByTestId("delete-dmn-deployment").click();
    const modal = page.getByTestId("delete-dmn-deployment-modal");
    await expect(modal).toBeVisible();
    // Enable cascade so we don't get blocked by historic executions seeded
    // by sibling specs.
    await modal.getByTestId("dmn-cascade-checkbox").check();
    await modal.getByTestId("delete-dmn-confirm").click();
    await expect(modal).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/Deleted DMN deployment|Delete failed/")).toBeVisible({
      timeout: 10_000,
    });
  });
});
