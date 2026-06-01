// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Upload BPMN deployment via the multipart modal (Story 9.2).
 *
 * Click Upload → pick a fixture .bpmn → Deploy → toast appears → row in
 * the deployments table → cleanup via the REST API. Verifies the AC-3
 * happy path against the live engine.
 *
 * Per Pattern P-009: real engine; no mocks. Fixture intentionally uses a
 * unique process id (`story-9-2-test-upload`) so it can't collide with
 * the seeded `loan-approval` fixture.
 */

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

test.describe("Upload BPMN deployment (Story 9.2)", () => {
  test.beforeAll(deleteTestDeployments);
  test.afterAll(deleteTestDeployments);

  test("clicks Upload, picks a .bpmn file, deploys, sees the new row", async ({ page }) => {
    await page.goto("/deployments");

    // Wait for the page to settle (Upload button enabled once data loads).
    const uploadBtn = page.locator('[data-testid="upload-deployment"]');
    await expect(uploadBtn).toBeEnabled({ timeout: 15_000 });

    await uploadBtn.click();
    const modal = page.locator('[data-testid="upload-deployment-modal"]');
    await expect(modal).toBeVisible();

    const input = page.locator('[data-testid="upload-deployment-input"]');
    await input.setInputFiles(resolve("e2e/fixtures/test-upload.bpmn"));

    const submit = page.locator('[data-testid="upload-deployment-submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Modal closes on success.
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // Success toast appears. Flowable strips the .bpmn extension from the
    // deployment name on the server side, so the toast reads "Deployed:
    // test-upload" (not "test-upload.bpmn"). Be lenient on the suffix.
    await expect(page.getByText(/Deployed: test-upload/)).toBeVisible({
      timeout: 10_000,
    });

    // New row appears in the table.
    const newRow = page
      .locator("tr[data-deployment-id]")
      .filter({ hasText: "test-upload" })
      .first();
    await expect(newRow).toBeVisible({ timeout: 10_000 });
  });

  test("validation rejects non-.bpmn files client-side", async ({ page }) => {
    await page.goto("/deployments");
    await expect(page.locator('[data-testid="upload-deployment"]')).toBeEnabled({
      timeout: 15_000,
    });
    await page.locator('[data-testid="upload-deployment"]').click();

    // Create a temporary non-.bpmn file payload.
    await page
      .locator('[data-testid="upload-deployment-input"]')
      .setInputFiles({ name: "junk.txt", mimeType: "text/plain", buffer: Buffer.from("nope") });

    await expect(page.locator('[data-testid="upload-validation"]')).toContainText(
      /\.bpmn, \.bpmn20\.xml, \.bar, or \.zip/,
    );
    await expect(page.locator('[data-testid="upload-deployment-submit"]')).toBeDisabled();

    // Escape closes the modal.
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-testid="upload-deployment-modal"]')).toBeHidden();
  });
});
