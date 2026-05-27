// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — DMN executions tab + row-expand (Story 15.4).
 *
 * Goals:
 *   1. `/decisions?tab=executions` renders against the live engine.
 *   2. Clicking a row expands input + output panels inline below.
 *   3. Single-expand invariant — clicking a second row collapses the first.
 *
 * Seeds the engine in beforeAll with a deployed sample.dmn + 2 executed
 * decisions, so the row-expand + single-expand-invariant tests don't
 * skip on an empty engine.
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

async function executeOnce(score: number): Promise<void> {
  const res = await fetch(`${FLOWABLE_DMN}/dmn-rule/execute`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({
      decisionKey: "e2eSampleDecision",
      inputVariables: [{ name: "score", type: "long", value: score }],
    }),
  });
  if (!res.ok) throw new Error(`Seed execute failed: ${res.status} ${await res.text()}`);
}

async function cleanupSampleDmn(): Promise<void> {
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

test.describe("DMN executions tab (Story 15.4)", () => {
  test.beforeAll(async () => {
    await cleanupSampleDmn();
    await deploySampleDmn();
    // Two executions so the single-expand-invariant test has a second row.
    await executeOnce(90);
    await executeOnce(60);
  });
  test.afterAll(cleanupSampleDmn);

  test("executions tab renders against live engine", async ({ page }) => {
    await page.goto("/decisions?tab=executions");
    await expect(page.getByTestId("decisions-tabs")).toBeVisible();
    // Scope to the tabs row — the page-head's inspector chips include
    // a `.ep-chip` button titled "GET /dmn-history/historic-decision-executions"
    // whose accessible name also matches "Executions" and outranks the
    // seg-btn on `.first()`.
    const executionsBtn = page
      .getByTestId("decisions-tabs")
      .getByRole("button", { name: "Executions" });
    await expect(executionsBtn).toHaveAttribute("data-on", "1");

    const empty = page.getByTestId("empty-state");
    const rows = page.locator('[data-testid^="execution-row-"]');
    await expect
      .poll(async () => (await empty.isVisible()) || (await rows.count()) > 0, {
        timeout: 15_000,
      })
      .toBeTruthy();
  });

  test("execution row click expands the detail panel with audit data", async ({ page }) => {
    await page.goto("/decisions?tab=executions");
    const rows = page.locator('[data-testid^="execution-row-"]');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const first = rows.first();
    await first.click();
    const detail = page.locator('[data-testid^="execution-detail-"]').first();
    await expect(detail).toBeVisible();
    // Row-expand lazy-fetches `/dmn-history/.../auditdata` and renders the
    // <DmnExecutionAuditPanel>: typed inputs + decision result + per-rule
    // trace. The headings are "Input variables" and "Decision result"
    // (the older "Output variables" was renamed when the audit panel
    // replaced the list-derived row-expand).
    await expect(detail.locator("text=/Input variables/i")).toBeVisible();
    await expect(detail.locator("text=/Decision result/i")).toBeVisible();
  });

  test("single-expand invariant: clicking a second row collapses the first", async ({ page }) => {
    await page.goto("/decisions?tab=executions");
    const rows = page.locator('[data-testid^="execution-row-"]');
    await expect(rows.nth(1)).toBeVisible({ timeout: 15_000 });
    await rows.first().click();
    const firstDetail = page.locator('[data-testid^="execution-detail-"]').first();
    await expect(firstDetail).toBeVisible();
    await rows.nth(1).click();
    // The first detail collapses; another detail appears.
    await expect
      .poll(async () => page.locator('[data-testid^="execution-detail-"]').count())
      .toBe(1);
  });
});
