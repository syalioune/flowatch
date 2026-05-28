/**
 * E2E — Read + edit instance variables on detail page (Story 10.4 + 19.1).
 *
 * Pre-seeds an instance with two variables via REST (integer + string),
 * navigates to the detail page, asserts both rows render with the right
 * names + values + types, asserts the row-count badge.
 *
 * Story 19.1 swap: the per-row Edit button is ENABLED + carries
 * data-testid="variable-edit-{name}". Tests the happy path (Edit → change
 * → save → modal closes → row reflects new value) and the failure path
 * (modal stays open + ErrorBox + form values preserved on engine 4xx).
 * The Story 10.4 placeholder-disabled assertion is removed in this same
 * PR per Epic 10 retro §3.5.
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

  test("renders both variables with the right values + types + enabled Edit (Story 19.1)", async ({
    page,
  }) => {
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

    // Story 19.1: Edit buttons are ENABLED + carry per-row data-testid.
    await expect(page.getByTestId("variable-edit-amount")).toBeEnabled();
    await expect(page.getByTestId("variable-edit-currency")).toBeEnabled();

    await expect(page.getByTestId("variables-refresh")).toBeEnabled();
  });

  test("Story 19.1: edit happy path — modal closes + row reflects new value", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("variable-edit-amount").click();
    await expect(page.getByTestId("edit-variable-modal")).toBeVisible();

    const valueInput = page.getByTestId("edit-variable-value");
    await valueInput.fill("2500");

    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/runtime/process-instances/${inst?.id}/variables`) &&
        r.request().method() === "PUT",
    );
    await page.getByTestId("edit-variable-submit").click();
    const putResp = await putPromise;
    expect([200, 201, 204]).toContain(putResp.status());

    // Modal closes on success.
    await expect(page.getByTestId("edit-variable-modal")).toBeHidden();
    // Row reflects the new value.
    await expect(amountRow).toContainText("2500");
  });

  test("Story 19.1: edit failure path — modal stays open + form preserved", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("variable-edit-amount").click();
    await expect(page.getByTestId("edit-variable-modal")).toBeVisible();

    // Type stays "integer"; submit a non-numeric value the engine will reject.
    const valueInput = page.getByTestId("edit-variable-value");
    await valueInput.fill("not-a-number");

    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/runtime/process-instances/${inst?.id}/variables`) &&
        r.request().method() === "PUT",
    );
    await page.getByTestId("edit-variable-submit").click();
    const putResp = await putPromise;
    // The engine surfaces a 4xx for the type-coercion mismatch.
    expect(putResp.status()).toBeGreaterThanOrEqual(400);
    expect(putResp.status()).toBeLessThan(500);

    // Modal stays open + ErrorBox renders + form value preserved.
    await expect(page.getByTestId("edit-variable-modal")).toBeVisible();
    await expect(page.getByTestId("error-box")).toBeVisible();
    await expect(page.getByTestId("edit-variable-value")).toHaveValue("not-a-number");

    // Close the modal so the next test starts clean.
    await page.getByTestId("edit-variable-cancel").click();
  });

  test("Story 19.1: modal carries the Epic 18.2 ARIA convention on day one", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("variable-edit-amount").click();
    const dialog = page.getByRole("dialog", { name: "Edit variable" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "edit-variable-title");
    await page.getByTestId("edit-variable-cancel").click();
  });
});
