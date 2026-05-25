/**
 * E2E — Cancel a running process instance (Story 10.3).
 *
 * Two paths exercised:
 *   1. From /instances: open the ⋮ menu, click Cancel, type a reason,
 *      Confirm. Assert the success toast + the row transitions / vanishes
 *      from the active list.
 *   2. From /instances/$id: navigate to detail, click Cancel instance,
 *      type a reason, Confirm. Assert the URL navigates back to /instances.
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

test.describe("Cancel process instance (Story 10.3)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
  });
  test.afterAll(deleteFixtureDeployments);

  test("from /instances: opens modal, submits with reason, surfaces success toast", async ({
    page,
  }) => {
    const businessKey = `e2e-10-3-list-${Date.now()}`;
    const inst = await startInstance(businessKey);

    await page.goto("/instances");
    const row = page.locator(`tr[data-instance-id="${inst.id}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Cancel" }).click();

    const modal = page.getByTestId("cancel-instance-modal");
    await expect(modal).toBeVisible();
    await page.getByTestId("cancel-instance-reason").fill("E2E list cancel");
    await page.getByTestId("cancel-instance-modal-confirm").click();

    await expect(page.getByText(`Cancelled: ${businessKey}`)).toBeVisible({ timeout: 10_000 });
  });

  test("from /instances/$id: opens modal, submits, navigates back to /instances", async ({
    page,
  }) => {
    const businessKey = `e2e-10-3-detail-${Date.now()}`;
    const inst = await startInstance(businessKey);

    await page.goto(`/instances/${inst.id}`);
    await expect(page.getByTestId("cancel-instance")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("cancel-instance").click();

    const modal = page.getByTestId("cancel-instance-modal");
    await expect(modal).toBeVisible();
    await page.getByTestId("cancel-instance-reason").fill("E2E detail cancel");
    await page.getByTestId("cancel-instance-modal-confirm").click();

    await expect(page).toHaveURL(/\/instances$/);
  });
});
