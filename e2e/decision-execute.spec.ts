// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — execute decision flow (Story 15.3).
 *
 * Goals:
 *   1. Test execute action on a list row opens `<ExecuteDecisionModal>`.
 *   2. The detail page's Test execute button opens the modal.
 *
 * Seeds the engine with `sample.dmn` (decision key `e2eSampleDecision`)
 * in beforeAll so the tests don't skip on an empty engine. The Story
 * 15.3 JSON-parse-error test was retired with the form-mode modal — the
 * modal defaults to form-mode when the DMN XML parses successfully, and
 * the JSON-mode parser is covered by unit tests in
 * `src/lib/__tests__/execute-decision-modal.test.tsx`.
 *
 * Per Pattern P-009: real engine calls, no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE_DMN = "http://localhost:8080/flowable-rest/dmn-api";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function deploySampleDmn(): Promise<void> {
  const xml = readFileSync(resolve("e2e/fixtures/sample.dmn"));
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "sample.dmn");
  form.append("deploymentName", "sample.dmn");
  const res = await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) throw new Error(`Seed DMN deploy failed: ${res.status} ${await res.text()}`);
}

async function cleanupSampleDmn(): Promise<void> {
  // Cascade so any historic executions seeded by sibling tests don't 409 the cleanup.
  const res = await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments?size=200`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as { data: Array<{ id: string; name?: string }> };
  for (const dep of body.data) {
    if (dep.name === "sample.dmn") {
      await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments/${dep.id}?cascade=true`, {
        method: "DELETE",
        headers: { Authorization: BASIC },
      });
    }
  }
}

test.describe("DMN test execute (Story 15.3)", () => {
  test.beforeAll(async () => {
    await cleanupSampleDmn();
    await deploySampleDmn();
  });
  test.afterAll(cleanupSampleDmn);

  test("execute decision from list-row action menu", async ({ page }) => {
    // Default tab is `deployments`; the decisions list lives at ?tab=decisions.
    await page.goto("/decisions?tab=decisions");
    const row = page.locator('[data-testid="decision-row-e2eSampleDecision"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByTestId("test-execute").click();
    const modal = page.getByTestId("execute-decision-modal");
    await expect(modal).toBeVisible();
    // The modal stays open on success / iterate-shape; close it explicitly.
    // Use exact match so we don't collide with the header icon-btn whose
    // aria-label is "Close test execute modal".
    await modal.getByRole("button", { name: "Close", exact: true }).click();
    await expect(modal).not.toBeVisible();
  });

  test("execute decision from detail page", async ({ page }) => {
    await page.goto("/decisions?tab=decisions");
    const row = page.locator('[data-testid="decision-row-e2eSampleDecision"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator("td").first().click();
    await page.getByTestId("test-execute-from-detail").click();
    const modal = page.getByTestId("execute-decision-modal");
    await expect(modal).toBeVisible();
  });
});
