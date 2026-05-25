/**
 * E2E — Start a process instance from a definition (Story 10.2).
 *
 * Uploads the loan-approval fixture (user-task-bearing so the instance
 * stays running), navigates to /definitions, opens the row's ⋮ menu,
 * clicks Start instance, types a business key + minimal JSON, clicks
 * Start, and asserts the URL transitions to /instances/{id} and that
 * the new instance's detail page renders the business key.
 *
 * Cleanup cancels the started instance and removes the deployment.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "loan-approval.bpmn20.xml";

interface FlowablePage<T> {
  data: T[];
}

interface FlowableDeployment {
  id: string;
}

async function deleteFixtureDeployments() {
  const res = await fetch(`${FLOWABLE}/repository/deployments?name=${FIXTURE_NAME}&size=100`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as FlowablePage<FlowableDeployment>;
  for (const dep of body.data) {
    await fetch(`${FLOWABLE}/repository/deployments/${dep.id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

async function uploadFixture(): Promise<void> {
  const xml = readFileSync(resolve(`e2e/fixtures/${FIXTURE_NAME}`));
  const form = new FormData();
  form.append("deployment", new Blob([xml], { type: "application/xml" }), FIXTURE_NAME);
  const res = await fetch(`${FLOWABLE}/repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) throw new Error(`Fixture deploy failed: ${res.status} ${await res.text()}`);
}

test.describe("Start a process instance (Story 10.2)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
  });
  test.afterAll(deleteFixtureDeployments);

  test("opens the modal, submits, and navigates to the new instance", async ({ page }) => {
    const businessKey = `e2e-10-2-${Date.now()}`;
    await page.goto("/definitions");

    // Find the row for the loanApproval definition.
    const row = page
      .locator("tr")
      .filter({ has: page.locator("td.mono.mute", { hasText: "loanApproval" }) })
      .first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Start instance" }).click();

    const modal = page.getByTestId("start-instance-modal");
    await expect(modal).toBeVisible();
    await page.getByTestId("start-instance-business-key").fill(businessKey);
    await page.getByTestId("start-instance-variables").fill('{"amount":1000}');
    await page.getByTestId("start-instance-submit").click();

    await expect(page).toHaveURL(/\/instances\/[a-z0-9-]+$/i);
    await expect(page.getByText(businessKey).first()).toBeVisible({ timeout: 15_000 });
  });
});
