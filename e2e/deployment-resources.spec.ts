// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /deployments/$id Resources panel + Download (Story 9.6).
 *
 * Deploys the test fixture, navigates to the deployment detail page,
 * asserts the Resources table renders, clicks Download on the first
 * row, captures the download via Playwright's download event, and
 * verifies the saved file starts with `<?xml` (proves the bytes are
 * real, not an HTML error page).
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

async function uploadFixture(): Promise<{ id: string }> {
  const xml = readFileSync(resolve("e2e/fixtures/test-upload.bpmn"));
  const form = new FormData();
  form.append("deployment", new Blob([xml], { type: "application/xml" }), "test-upload.bpmn");
  const res = await fetch(`${FLOWABLE}/repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) throw new Error(`Fixture deploy failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string };
}

test.describe("/deployments/$id Resources panel (Story 9.6)", () => {
  test.beforeEach(deleteTestDeployments);
  test.afterAll(deleteTestDeployments);

  test("lists deployment resources + downloads the bytes preserving filename", async ({ page }) => {
    const deployment = await uploadFixture();
    await page.goto(`/deployments/${deployment.id}`);

    // Wait for the Resources table to render with at least one row.
    const table = page.locator('[data-testid="deployment-resources-table"]');
    await expect(table).toBeVisible({ timeout: 15_000 });

    const firstDownloadBtn = page.locator('[data-testid="download-resource"]').first();
    await expect(firstDownloadBtn).toBeVisible();

    // Intercept the download event triggered by the anchor click.
    const [download] = await Promise.all([page.waitForEvent("download"), firstDownloadBtn.click()]);

    // Suggested filename matches the resource name (test-upload.bpmn).
    expect(download.suggestedFilename()).toBe("test-upload.bpmn");

    // Save and verify the bytes look like XML.
    const tmpPath = join(tmpdir(), `9-6-${Date.now()}.bpmn`);
    await download.saveAs(tmpPath);
    const content = readFileSync(tmpPath, "utf8");
    expect(content.startsWith("<?xml")).toBe(true);
  });
});
