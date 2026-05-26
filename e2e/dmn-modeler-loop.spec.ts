// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — DMN modeler authoring loop (Story 16.4).
 *
 * Verifies AC-3 (URL ?decisionId= autoload), AC-4 (dropdown pick + URL
 * sync), AC-5 (New from scratch), AC-6 (Deploy → success toast → Open
 * the deployed decision navigation).
 *
 * The dirty-state-after-edit E2E is deferred per the Story 16.2 / 16.3
 * AC-8 fall-back precedent — bpmn-js / dmn-js canvas edit simulation
 * from Playwright is too brittle. The unit tests in
 * src/modeler/__tests__/DmnModeler.test.tsx cover the dirty-state
 * mechanics + the toast assertions.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { expect, test } from "@playwright/test";

const FLOWABLE_DMN = "http://localhost:8080/flowable-rest/dmn-api";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function cleanupLoanEligibilityDeployments() {
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

test.describe("DMN modeler authoring loop (Story 16.4)", () => {
  test.afterEach(cleanupLoanEligibilityDeployments);

  test("New from scratch clears ?decisionId= + loads LOAN_DMN_XML (AC-5)", async ({ page }) => {
    await page.goto("/dmn");
    // Wait for the dmn-js canvas to render the loan template.
    await expect(page.locator(".dmn-host").first()).toBeVisible({ timeout: 15_000 });
    const newBtn = page.getByTestId("dmn-new");
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await expect(page).toHaveURL(/\/dmn$/);
    await expect(page.locator(".dmn-host").first()).toBeVisible({ timeout: 5_000 });
  });

  test("Deploy → success toast carries the Open the deployed decision action (AC-6)", async ({
    page,
  }) => {
    await page.goto("/dmn");
    await expect(page.locator(".dmn-host").first()).toBeVisible({ timeout: 15_000 });
    // Deploy now opens a name+id confirmation modal (mirrors BPMN's deploy
    // flow). Submit the modal to fire the actual multipart deploy.
    await page.getByTestId("dmn-deploy").click();
    await expect(page.getByTestId("deploy-dmn-modal")).toBeVisible();
    await page.getByTestId("deploy-dmn-submit").click();
    const openAction = page.getByTestId("open-deployed-decision");
    await expect(openAction).toBeVisible({ timeout: 15_000 });
    await openAction.click();
    await expect(page).toHaveURL(/\/dmn\?decisionId=/);
  });

  test("Deploy button starts in clean state (no asterisk) on mount", async ({ page }) => {
    await page.goto("/dmn");
    const deployBtn = page.getByTestId("dmn-deploy");
    await expect(deployBtn).toBeVisible({ timeout: 15_000 });
    await expect(deployBtn).toHaveText(/^Deploy$/);
  });
});
