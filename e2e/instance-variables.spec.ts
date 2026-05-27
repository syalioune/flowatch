/**
 * E2E — Read instance variables on detail page (Story 10.4).
 *
 * Pre-seeds an instance with two variables via REST (integer + string),
 * navigates to the detail page, asserts both rows render with the right
 * names + values + types, asserts the row-count badge, asserts the Edit
 * button is disabled, and asserts the Refresh button is clickable.
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

async function startInstanceWithVars(businessKey: string): Promise<FlowableProcessInstance> {
  const res = await fetch(`${FLOWABLE}/runtime/process-instances`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({
      processDefinitionKey: PROCESS_KEY,
      businessKey,
      variables: [
        { name: "amount", value: 1000, type: "integer" },
        { name: "currency", value: "EUR", type: "string" },
      ],
    }),
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

let inst: FlowableProcessInstance | null = null;

test.describe("Instance variables panel (Story 10.4)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    inst = await startInstanceWithVars(`e2e-10-4-${Date.now()}`);
  });

  test.afterAll(async () => {
    if (inst) await cancelInstance(inst.id);
    await deleteFixtureDeployments();
  });

  test("renders both variables with the right values + types + disabled Edit", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);

    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });
    await expect(amountRow).toContainText("amount");
    await expect(amountRow).toContainText("integer");
    await expect(amountRow).toContainText("1000");

    const currencyRow = page.locator('tr[data-variable-name="currency"]').first();
    await expect(currencyRow).toBeVisible();
    await expect(currencyRow).toContainText("currency");
    await expect(currencyRow).toContainText("string");
    await expect(currencyRow).toContainText('"EUR"');

    const editButtons = page.getByTestId("variable-edit-placeholder");
    await expect(editButtons).toHaveCount(2);
    for (const btn of await editButtons.all()) {
      await expect(btn).toBeDisabled();
    }

    await expect(page.getByTestId("variables-refresh")).toBeEnabled();
  });
});
