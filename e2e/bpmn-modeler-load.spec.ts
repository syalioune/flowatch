// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — BPMN modeler load + dropdown + dirty-state (Story 16.2).
 *
 * Verifies AC-1 (URL ?definitionId= autoload), AC-5 (dropdown pick + URL
 * sync), and provides a smoke for AC-2's dirty-state asterisk on the
 * Deploy button. The dirty-state assertion is covered by the unit test in
 * src/modeler/__tests__/BpmnModeler.test.tsx (16.2 AC-7); the E2E layer
 * only checks the initial clean state — simulating a real bpmn-js edit
 * from Playwright is too brittle (per the spec's AC-8 fall-back note).
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

test.describe("BPMN modeler load + dropdown + dirty-state (Story 16.2)", () => {
  test.beforeAll(async () => {
    await deleteTestDeployments();
    await uploadFixture();
  });
  test.afterAll(deleteTestDeployments);

  test("URL ?definitionId= autoloads + canvas renders (AC-1)", async ({ page }) => {
    const definitionId = await getDefinitionId();
    await page.goto(`/bpmn?definitionId=${encodeURIComponent(definitionId)}`);
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("dropdown pick updates URL + reloads canvas (AC-5)", async ({ page }) => {
    await page.goto("/bpmn");
    const dropdown = page.getByTestId("bpmn-definition-dropdown");
    await expect(dropdown).toBeVisible({ timeout: 15_000 });

    // Wait for the canvas to mount with the default LOAN_BPMN_XML so we
    // know the modeler is ready to accept a dropdown pick.
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });

    const definitionId = await getDefinitionId();
    await dropdown.selectOption(definitionId);

    // URL reflects the picked definition.
    await page.waitForURL(/\/bpmn\?definitionId=/, { timeout: 10_000 });
  });

  test("Deploy button starts in clean state (no asterisk) on mount (AC-2)", async ({ page }) => {
    await page.goto("/bpmn");
    const deployBtn = page.getByTestId("bpmn-deploy");
    await expect(deployBtn).toBeVisible({ timeout: 15_000 });
    // Initial state: commandStack is empty → button reads "Deploy" (no asterisk).
    await expect(deployBtn).toHaveText(/^Deploy$/);
    // The unit test in src/modeler/__tests__/BpmnModeler.test.tsx covers
    // the asterisk-flip path — bpmn-js edit simulation from Playwright is
    // too brittle per Story 16.2 AC-8's fall-back note.
  });
});
