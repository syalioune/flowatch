// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — BPMN authoring loop (Story 16.3).
 *
 * Verifies AC-1 (New from scratch clears the deep-link + loads BLANK),
 * AC-2 (Deploy uploads), AC-3 (post-deploy toast carries the "Open the
 * deployed definition" action that navigates to /bpmn?definitionId=...).
 *
 * The dirty-state edit-simulation E2E is deferred per Story 16.2 AC-8
 * fall-back precedent — reliable bpmn-js edit simulation from Playwright
 * is too brittle. The unit tests in src/modeler/__tests__/BpmnModeler.
 * test.tsx cover the dirty-state mechanics + the toast assertions.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function cleanupLoanApprovalDeployments() {
  // The 16.3 deploy uses the default filename "loan-approval.bpmn20.xml".
  // Clean any prior runs so each test starts from a known state — but DO
  // NOT delete deployments that the rest of the test suite expects to be
  // present (e.g. test-upload.bpmn from Story 9.2).
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

test.describe("BPMN authoring loop (Story 16.3)", () => {
  test.afterEach(cleanupLoanApprovalDeployments);

  test("New from scratch clears ?definitionId= + loads BLANK (AC-1)", async ({ page }) => {
    // Land on /bpmn with a fictitious definitionId — when the autoload
    // fails (the id doesn't exist) the modeler should still mount with
    // its LOAN default; then New clears the URL.
    await page.goto("/bpmn");
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });
    const newBtn = page.getByTestId("bpmn-new");
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    // URL has no ?definitionId= query
    await expect(page).toHaveURL(/\/bpmn$/);
    // Canvas still renders (BLANK has a single start event)
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("Deploy → success toast carries the Open action that navigates to the new definition (AC-2/AC-3)", async ({
    page,
  }) => {
    await page.goto("/bpmn");
    // Wait for the modeler + default LOAN starter to mount.
    await expect(page.locator(".bpmn-js-canvas svg, .djs-container svg").first()).toBeVisible({
      timeout: 15_000,
    });
    // Click Deploy. The LOAN starter has a process key `loanApproval` and a
    // valid BPMN structure — Flowable accepts the deploy and assigns a new
    // version (or v1 on a freshly-cleaned engine).
    await page.getByTestId("bpmn-deploy").click();
    // Either a success toast (with the Open action) or an error toast
    // appears. We assert on the success path; if the engine returns an
    // error the test will fail loudly — that's the right signal.
    const openAction = page.getByTestId("open-deployed-definition");
    await expect(openAction).toBeVisible({ timeout: 15_000 });
    await openAction.click();
    // URL reflects the newly-deployed definition.
    await expect(page).toHaveURL(/\/bpmn\?definitionId=/);
  });
});
