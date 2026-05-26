// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /decisions canonical list (Story 15.1).
 *
 * Goals:
 *   1. `/decisions?tab=decisions` (default) renders against the live engine.
 *   2. `/decisions?tab=deployments` shows the placeholder `Deploy DMN` button.
 *   3. Decision row click navigates to `/decisions/$key`.
 *   4. Placeholder row actions (Test execute) toast the forward-reference.
 *
 * The placeholder-toast assertions on lines `Test execute arrives in Story 15.3`
 * are SWAP POINTS: Story 15.3 drops those assertions when it lands the real
 * modal. Likewise the `Delete DMN deployment arrives in Story 15.2` toast and
 * the `Deploy DMN file arrives in Story 15.2` toast assertions are dropped by
 * Story 15.2 in the same PR.
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

test.describe("/decisions canonical list (Story 15.1)", () => {
  // Seed a DMN deployment so the row-navigation test doesn't skip on an
  // empty engine.
  test.beforeAll(async () => {
    await cleanupSampleDmn();
    await deploySampleDmn();
  });
  test.afterAll(cleanupSampleDmn);

  test("decisions list renders against live engine", async ({ page }) => {
    // Tab default changed to deployments; navigate explicitly to the
    // decisions tab to exercise the original Story 15.1 surface.
    await page.goto("/decisions?tab=decisions");
    await expect(page.getByTestId("decisions-tabs")).toBeVisible();
    // Scope to the tabs row — the page-head's inspector chips include
    // a `.ep-chip` button titled "GET /dmn-repository/decisions" whose
    // accessible name also matches "Decisions" and outranks the
    // seg-btn on `.first()`.
    const decisionsBtn = page
      .getByTestId("decisions-tabs")
      .getByRole("button", { name: "Decisions" });
    await expect(decisionsBtn).toHaveAttribute("data-on", "1");

    // Wait for either the empty state OR at least one row to appear.
    const empty = page.getByTestId("empty-state");
    const rows = page.locator('[data-testid^="decision-row-"]');
    await expect
      .poll(async () => (await empty.isVisible()) || (await rows.count()) > 0, {
        timeout: 15_000,
      })
      .toBeTruthy();
  });

  test("decisions tab switches to deployments tab", async ({ page }) => {
    await page.goto("/decisions");
    await page.getByRole("button", { name: "Deployments" }).first().click();
    await expect(page).toHaveURL(/[?&]tab=deployments/);
    await expect(page.getByTestId("deploy-dmn")).toBeVisible();
  });

  test("decision row click navigates to detail page", async ({ page }) => {
    await page.goto("/decisions?tab=decisions");
    const row = page.locator('[data-testid="decision-row-e2eSampleDecision"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator("td").first().click();
    await expect(page).toHaveURL(/\/decisions\/[^/]+$/);
    await expect(page.getByTestId("test-execute-from-detail")).toBeVisible();
  });
});
