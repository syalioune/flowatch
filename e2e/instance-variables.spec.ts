/**
 * E2E — Read + edit + add + delete instance variables on detail page
 * (Story 10.4 + 19.1 + 19.2).
 *
 * Pre-seeds an instance with two variables via REST (integer + string).
 *
 * Story 19.1 swap: the per-row action is the RowActionMenu (since 19.2);
 * Edit happy path / failure path / ARIA. Story 19.2: Add (happy + failure
 * + duplicate-name warning), Delete (happy + cancel), ARIA on both new
 * modals (alertdialog on Delete), `<RowActionMenu>` keyboard navigation.
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

  test("renders both variables + RowActionMenu triggers + Add variable button (Story 19.2)", async ({
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

    // Story 19.2: RowActionMenu triggers (the ⋮ button) on each row.
    await expect(amountRow.getByTestId("row-action-trigger")).toBeVisible();
    await expect(currencyRow.getByTestId("row-action-trigger")).toBeVisible();
    // Story 19.2: Add variable button in the panel header.
    await expect(page.getByTestId("add-variable")).toBeEnabled();
    await expect(page.getByTestId("variables-refresh")).toBeEnabled();
  });

  test("Story 19.1: edit happy path — modal closes + row reflects new value", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await amountRow.getByTestId("row-action-trigger").click();
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

    await amountRow.getByTestId("row-action-trigger").click();
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

    await amountRow.getByTestId("row-action-trigger").click();
    await page.getByTestId("variable-edit-amount").click();
    const dialog = page.getByRole("dialog", { name: "Edit variable" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "edit-variable-title");
    await page.getByTestId("edit-variable-cancel").click();
  });

  test("Story 19.2: Add happy path — modal closes + new row appears", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    const probeName = `e2e-add-${Date.now()}`;
    await page.getByTestId("add-variable").click();
    await expect(page.getByTestId("add-variable-modal")).toBeVisible();
    await page.getByTestId("add-variable-name").fill(probeName);
    await page.getByTestId("add-variable-value").fill("gold");

    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/runtime/process-instances/${inst?.id}/variables`) &&
        r.request().method() === "PUT",
    );
    await page.getByTestId("add-variable-submit").click();
    const putResp = await putPromise;
    expect([200, 201, 204]).toContain(putResp.status());

    await expect(page.getByTestId("add-variable-modal")).toBeHidden();
    await expect(page.locator(`tr[data-variable-name="${probeName}"]`).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Story 19.2: Add failure path — modal stays open + ErrorBox + form preserved", async ({
    page,
  }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("add-variable").click();
    await expect(page.getByTestId("add-variable-modal")).toBeVisible();
    await page.getByTestId("add-variable-name").fill(`e2e-fail-${Date.now()}`);
    await page.getByTestId("add-variable-type").selectOption("integer");
    await page.getByTestId("add-variable-value").fill("not-a-number");

    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/runtime/process-instances/${inst?.id}/variables`) &&
        r.request().method() === "PUT",
    );
    await page.getByTestId("add-variable-submit").click();
    const putResp = await putPromise;
    expect(putResp.status()).toBeGreaterThanOrEqual(400);
    expect(putResp.status()).toBeLessThan(500);

    await expect(page.getByTestId("add-variable-modal")).toBeVisible();
    await expect(page.getByTestId("error-box")).toBeVisible();
    await expect(page.getByTestId("add-variable-value")).toHaveValue("not-a-number");
    await page.getByTestId("add-variable-cancel").click();
  });

  test("Story 19.2: Add duplicate-name warning fires client-side", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("add-variable").click();
    await expect(page.getByTestId("add-variable-modal")).toBeVisible();
    await page.getByTestId("add-variable-name").fill("amount");
    await expect(page.getByTestId("add-variable-duplicate-warning")).toBeVisible();
    await page.getByTestId("add-variable-cancel").click();
  });

  test("Story 19.2: Add modal ARIA contract (role=dialog)", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    await expect(page.locator('tr[data-variable-name="amount"]').first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("add-variable").click();
    const dialog = page.getByRole("dialog", { name: "Add variable" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "add-variable-title");
    await page.getByTestId("add-variable-cancel").click();
  });

  test("Story 19.2: Delete happy path — modal closes + row vanishes", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const probeName = `e2e-del-${Date.now()}`;

    // Seed: add the variable via REST so we can delete it through the UI
    // without dragging in the Add e2e path as a dependency.
    await fetch(`${FLOWABLE}/runtime/process-instances/${inst?.id}/variables`, {
      method: "PUT",
      headers: { Authorization: BASIC, "Content-Type": "application/json" },
      body: JSON.stringify([{ name: probeName, value: "ephemeral", type: "string" }]),
    });

    const probeRow = page.locator(`tr[data-variable-name="${probeName}"]`).first();
    await page.getByTestId("variables-refresh").click();
    await expect(probeRow).toBeVisible({ timeout: 10_000 });

    await probeRow.getByTestId("row-action-trigger").click();
    await page.getByTestId(`variable-delete-${probeName}`).click();
    await expect(page.getByTestId("delete-variable-modal")).toBeVisible();

    const deletePromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/runtime/process-instances/${inst?.id}/variables/${probeName}`) &&
        r.request().method() === "DELETE",
    );
    await page.getByTestId("delete-variable-submit").click();
    const delResp = await deletePromise;
    expect([200, 204]).toContain(delResp.status());

    await expect(page.getByTestId("delete-variable-modal")).toBeHidden();
    // AC-8 review patch: assert the success toast text.
    await expect(page.getByText(`Variable ${probeName} deleted`)).toBeVisible({ timeout: 5_000 });
    await expect(probeRow).toHaveCount(0, { timeout: 10_000 });
  });

  test("Story 19.2: Delete cancel — modal closes + row stays", async ({ page }) => {
    await page.goto(`/instances/${inst?.id}`);
    const currencyRow = page.locator('tr[data-variable-name="currency"]').first();
    await expect(currencyRow).toBeVisible({ timeout: 15_000 });

    await currencyRow.getByTestId("row-action-trigger").click();
    await page.getByTestId("variable-delete-currency").click();
    await expect(page.getByTestId("delete-variable-modal")).toBeVisible();
    await page.getByTestId("delete-variable-cancel").click();
    await expect(page.getByTestId("delete-variable-modal")).toBeHidden();
    await expect(currencyRow).toBeVisible();
  });

  test("Story 19.2: Delete modal ARIA contract (role=alertdialog destructive variant)", async ({
    page,
  }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    await amountRow.getByTestId("row-action-trigger").click();
    await page.getByTestId("variable-delete-amount").click();
    const dialog = page.getByRole("alertdialog", { name: "Delete variable?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "delete-variable-title");
    await page.getByTestId("delete-variable-cancel").click();
  });

  test("Story 19.2: RowActionMenu is keyboard-accessible (Enter opens, Esc closes)", async ({
    page,
  }) => {
    await page.goto(`/instances/${inst?.id}`);
    const amountRow = page.locator('tr[data-variable-name="amount"]').first();
    await expect(amountRow).toBeVisible({ timeout: 15_000 });

    // Focus the row action trigger and open via keyboard.
    const trigger = amountRow.getByTestId("row-action-trigger");
    await trigger.focus();
    await trigger.press("Enter");
    await expect(page.getByTestId("variable-edit-amount")).toBeVisible();
    // Escape closes the menu.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("variable-edit-amount")).toBeHidden();
  });
});
