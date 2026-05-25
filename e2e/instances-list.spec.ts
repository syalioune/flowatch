/**
 * E2E — /instances list with row navigation + Cancel placeholder (Story 10.1).
 *
 * Uploads the loan-approval fixture (a userTask-bearing process so the
 * started instance stays running), starts an instance via REST, navigates
 * to /instances, asserts the row appears, opens the action menu, clicks
 * Cancel and asserts the Story 10.3 placeholder toast, then clicks the
 * row body and asserts the URL transitions to /instances/{id}. Cleanup
 * cancels the started instance and removes the fixture deployment.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "loan-approval.bpmn20.xml";
const PROCESS_KEY = "loanApproval";

interface FlowablePage<T> {
  data: T[];
}

interface FlowableDeployment {
  id: string;
}

interface FlowableProcessInstance {
  id: string;
  businessKey?: string;
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

async function startInstance(businessKey: string): Promise<FlowableProcessInstance> {
  const res = await fetch(`${FLOWABLE}/runtime/process-instances`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ processDefinitionKey: PROCESS_KEY, businessKey }),
  });
  if (!res.ok) throw new Error(`Start failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as FlowableProcessInstance;
}

async function cancelInstance(id: string): Promise<void> {
  await fetch(`${FLOWABLE}/runtime/process-instances/${id}?deleteReason=e2e-cleanup`, {
    method: "DELETE",
    headers: { Authorization: BASIC },
  });
}

const BUSINESS_KEY = `e2e-10-1-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/instances list (Story 10.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("renders the running instance row with state badge", async ({ page }) => {
    await page.goto("/instances");
    const row = page.locator(`tr[data-instance-id="${startedInstance?.id}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator(".badge")).toHaveText(/active/);
    await expect(row.locator("td").first()).toContainText(BUSINESS_KEY);
  });

  test("Cancel menu item shows the Story 10.3 placeholder toast", async ({ page }) => {
    await page.goto("/instances");
    const row = page.locator(`tr[data-instance-id="${startedInstance?.id}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Cancel" }).click();
    await expect(page.getByText(/Cancel arrives in Story 10\.3/)).toBeVisible();
  });

  test("clicking the row body navigates to /instances/{id}", async ({ page }) => {
    await page.goto("/instances");
    const row = page.locator(`tr[data-instance-id="${startedInstance?.id}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Click on the business-key cell (avoid the action-menu cell).
    await row.locator("td").first().click();
    await expect(page).toHaveURL(new RegExp(`/instances/${startedInstance?.id}$`));
  });
});
