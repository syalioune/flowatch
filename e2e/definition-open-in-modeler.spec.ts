// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — Open in modeler deep-link (Story 9.5).
 *
 * Verifies AC-1 (menu item navigates), AC-2 (search-param name), AC-3
 * (modeler loads the XML for the definition), and AC-5 (direct URL
 * paste works too).
 *
 * Pre-deploys a fixture BPMN, fetches its definition id via the live
 * engine, then exercises both the menu path and the direct-URL path.
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

async function getDefinitionId(): Promise<string> {
  const res = await fetch(`${FLOWABLE}/repository/process-definitions?key=story-9-2-test-upload`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) throw new Error(`Definition lookup failed: ${res.status}`);
  const body = (await res.json()) as { data: Array<{ id: string }> };
  const first = body.data[0];
  if (!first) throw new Error("No definition found for key story-9-2-test-upload");
  return first.id;
}

test.describe("Open in modeler deep-link (Story 9.5)", () => {
  test.beforeAll(async () => {
    await deleteTestDeployments();
    await uploadFixture();
  });
  test.afterAll(deleteTestDeployments);

  test("clicking Open in modeler navigates to /bpmn?definitionId=...", async ({ page }) => {
    await page.goto("/definitions");
    const row = page.locator('tr[data-definition-id^="story-9-2-test-upload"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Open in modeler" }).click();

    // URL becomes /bpmn?definitionId=<id>
    await page.waitForURL(/\/bpmn\?definitionId=/, { timeout: 10_000 });

    // Modeler canvas renders at least one BPMN shape (the test fixture has
    // a start → end pair). bpmn-js renders into <svg> elements inside the
    // canvas container.
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("direct URL paste loads the modeler (AC-5)", async ({ page }) => {
    const definitionId = await getDefinitionId();
    await page.goto(`/bpmn?definitionId=${encodeURIComponent(definitionId)}`);
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
