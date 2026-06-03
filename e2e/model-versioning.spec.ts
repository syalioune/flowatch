// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — "Save as new version" in the BPMN/DMN modeler (Story 27.1).
 *
 * Verifies the operator-feel versioning loop for BOTH modelers:
 *   - deploy an initial version, load it from the engine
 *   - click "Save as new version" → the deploy modal opens key-locked
 *     (the key/id field is read-only)
 *   - submit → the engine assigns vN+1, the modeler switches to the new
 *     version, the dropdown lists both versions, and a "View previous
 *     version (vN)" link appears whose href carries the prior id
 *   - clicking the link reloads the prior version
 *
 * The wire-level action is the SAME multipart deploy as the generic
 * Deploy — Flowable auto-versions per key. No new API endpoint.
 *
 * Per Pattern P-009: real engine; no mocks. Canvas edit-simulation is
 * deferred per the Story 16.2/16.3 precedent — we redeploy the loaded
 * starter unchanged, which still produces a fresh version per key.
 */

import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const FLOWABLE_DMN = "http://localhost:8080/flowable-rest/dmn-api";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function cleanupBpmnDeployments() {
  const res = await fetch(
    `${FLOWABLE}/repository/deployments?name=loan-approval.bpmn20.xml&size=100`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) return;
  const body = (await res.json()) as { data: Array<{ id: string }> };
  for (const dep of body.data) {
    await fetch(`${FLOWABLE}/repository/deployments/${dep.id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

async function cleanupDmnDeployments() {
  const res = await fetch(
    `${FLOWABLE_DMN}/dmn-repository/deployments?nameLike=loan-eligibility.dmn&size=100`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) return;
  const body = (await res.json()) as { data: Array<{ id: string }> };
  for (const dep of body.data) {
    await fetch(`${FLOWABLE_DMN}/dmn-repository/deployments/${dep.id}`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

function idFromUrl(url: string, param: "definitionId" | "decisionId"): string {
  return new URL(url).searchParams.get(param) ?? "";
}

test.describe("BPMN — Save as new version (Story 27.1)", () => {
  test.beforeEach(cleanupBpmnDeployments);
  test.afterEach(cleanupBpmnDeployments);

  test("save-as-new-version bumps the version + preserves the previous-version link", async ({
    page,
  }) => {
    await page.goto("/bpmn");
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });

    // 1. Deploy an initial version and open it so a deployed definition is loaded.
    await page.getByTestId("bpmn-deploy").click();
    await expect(page.getByTestId("deploy-bpmn-modal")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("deploy-bpmn-submit").click();
    const openAction = page.getByTestId("open-deployed-definition");
    await expect(openAction).toBeVisible({ timeout: 15_000 });
    await openAction.click();
    await expect(page).toHaveURL(/\/bpmn\?definitionId=/);
    const prevId = idFromUrl(page.url(), "definitionId");
    expect(prevId).not.toBe("");

    // 2. "Save as new version" appears only for a loaded deployed definition.
    const saveVersionBtn = page.getByTestId("bpmn-save-new-version");
    await expect(saveVersionBtn).toBeVisible({ timeout: 15_000 });
    await saveVersionBtn.click();

    // 3. The deploy modal opens key-locked.
    await expect(page.getByTestId("deploy-bpmn-modal")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("deploy-bpmn-key")).toHaveAttribute("readonly", "");
    await expect(page.getByTestId("deploy-bpmn-key-locked-caption")).toBeVisible();
    await page.getByTestId("deploy-bpmn-submit").click();

    // 4. The modeler switches to the new version (URL changes to a different id).
    await expect
      .poll(() => idFromUrl(page.url(), "definitionId"), { timeout: 15_000 })
      .not.toBe(prevId);

    const newId = idFromUrl(page.url(), "definitionId");

    // 5. The dropdown lists BOTH versions — the prior id AND the new id are
    // both present as <option> values (the dropdown lists every definition,
    // so we assert presence of the two specific versions, not a total count).
    const dropdown = '[data-testid="bpmn-definition-dropdown"]';
    await expect(page.locator(`${dropdown} option[value="${prevId}"]`)).toHaveCount(1);
    await expect(page.locator(`${dropdown} option[value="${newId}"]`)).toHaveCount(1);

    // 6. The "View previous version" link points at the prior id.
    const prevLink = page.getByTestId("bpmn-view-previous-version");
    await expect(prevLink).toBeVisible();
    await expect(prevLink).toHaveText(/View previous version \(v\d+\)/);
    // The id contains colons which the href URL-encodes (%3A) — decode the
    // attribute before asserting it carries the prior definition id.
    const bpmnHref = await prevLink.getAttribute("href");
    expect(decodeURIComponent(bpmnHref ?? "")).toContain(`definitionId=${prevId}`);

    // 7. Clicking it reloads the prior version.
    await prevLink.click();
    await expect
      .poll(() => idFromUrl(page.url(), "definitionId"), { timeout: 10_000 })
      .toBe(prevId);
  });
});

test.describe("DMN — Save as new version (Story 27.1)", () => {
  test.beforeEach(cleanupDmnDeployments);
  test.afterEach(cleanupDmnDeployments);

  test("save-as-new-version bumps the version + preserves the previous-version link", async ({
    page,
  }) => {
    await page.goto("/dmn");
    await expect(page.locator(".dmn-host").first()).toBeVisible({ timeout: 15_000 });

    // 1. Deploy an initial version and open it.
    await page.getByTestId("dmn-deploy").click();
    await expect(page.getByTestId("deploy-dmn-modal")).toBeVisible({ timeout: 5_000 });
    await page.getByTestId("deploy-dmn-submit").click();
    const openAction = page.getByTestId("open-deployed-decision");
    await expect(openAction).toBeVisible({ timeout: 15_000 });
    await openAction.click();
    await expect(page).toHaveURL(/\/dmn\?decisionId=/);
    const prevId = idFromUrl(page.url(), "decisionId");
    expect(prevId).not.toBe("");

    // 2. "Save as new version" appears for a loaded deployed decision.
    const saveVersionBtn = page.getByTestId("dmn-save-new-version");
    await expect(saveVersionBtn).toBeVisible({ timeout: 15_000 });
    await saveVersionBtn.click();

    // 3. The deploy modal opens id-locked.
    await expect(page.getByTestId("deploy-dmn-modal")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("deploy-dmn-key")).toHaveAttribute("readonly", "");
    await expect(page.getByTestId("deploy-dmn-key-locked-caption")).toBeVisible();
    await page.getByTestId("deploy-dmn-submit").click();

    // 4. The modeler switches to the new version.
    await expect
      .poll(() => idFromUrl(page.url(), "decisionId"), { timeout: 15_000 })
      .not.toBe(prevId);

    const newId = idFromUrl(page.url(), "decisionId");

    // 5. The dropdown lists BOTH versions (AC-5 symmetry with the BPMN block).
    const dropdown = '[data-testid="dmn-decision-dropdown"]';
    await expect(page.locator(`${dropdown} option[value="${prevId}"]`)).toHaveCount(1);
    await expect(page.locator(`${dropdown} option[value="${newId}"]`)).toHaveCount(1);

    // 6. The "View previous version" link points at the prior id.
    const prevLink = page.getByTestId("dmn-view-previous-version");
    await expect(prevLink).toBeVisible();
    await expect(prevLink).toHaveText(/View previous version \(v\d+\)/);
    const dmnHref = await prevLink.getAttribute("href");
    expect(decodeURIComponent(dmnHref ?? "")).toContain(`decisionId=${prevId}`);

    // 7. Clicking it reloads the prior version.
    await prevLink.click();
    await expect.poll(() => idFromUrl(page.url(), "decisionId"), { timeout: 10_000 }).toBe(prevId);
  });
});
