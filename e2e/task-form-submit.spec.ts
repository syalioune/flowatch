/**
 * E2E — task form submit (Story 11.3).
 *
 * Pre-seeds a process instance for the loan-with-form definition (which
 * has a userTask with two form properties: enum `decision` + string
 * `comment`). The test:
 *
 *   1. Navigates to /tasks?assignee=all; clicks the seeded row.
 *   2. Asserts the TaskFormPanel renders with the two fields.
 *   3. Selects the "approve" enum option; types a comment.
 *   4. Clicks Submit; asserts navigation back to /tasks; asserts the row
 *      is gone from the active list (proves the engine completed the task
 *      via the form submission, not via the legacy Complete button).
 *
 * Per Pattern P-009: real engine; no mocks. Cleanup cascade-deletes the
 * fixture deployment regardless of outcome.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "loan-with-form.bpmn20.xml";
const PROCESS_KEY = "loanWithForm";

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

interface FlowableTask {
  id: string;
  processInstanceId?: string;
}

async function findTaskForInstance(instanceId: string): Promise<FlowableTask | null> {
  const res = await fetch(`${FLOWABLE}/runtime/tasks?processInstanceId=${instanceId}&size=10`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as FlowablePage<FlowableTask>;
  return body.data[0] ?? null;
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

const BUSINESS_KEY = `e2e-11-3-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/tasks/$id form submit (Story 11.3)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    // If the form-submit succeeded, the instance has already completed and
    // the cancel DELETE will 404 silently. The cascade-delete on the
    // deployment is the load-bearing cleanup step.
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("form panel renders, fields update, submit completes the task", async ({ page }) => {
    // Resolve the task id via REST scoped to the seeded instance. Avoids
    // selecting `.first()` from the active list, which could pick up a
    // residual task from a prior spec at workers=1 and route the assertions
    // through the wrong path.
    expect(startedInstance).not.toBeNull();
    const task = await findTaskForInstance(startedInstance?.id ?? "");
    expect(task).not.toBeNull();
    const taskId = task?.id;
    expect(taskId).toBeTruthy();

    // Navigate directly to the detail page for this specific task.
    await page.goto(`/tasks/${taskId}`);

    // Form panel renders with two fields.
    await expect(page.getByTestId("task-form-panel")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("task-form-field-decision")).toBeVisible();
    await expect(page.getByTestId("task-form-field-comment")).toBeVisible();

    // The legacy Complete button is hidden when a form is present (AC-9).
    await expect(page.getByRole("button", { name: "Complete" })).toHaveCount(0);

    // Select the "approve" enum and type a comment.
    await page.getByRole("button", { name: "Approve" }).click();
    await page.getByLabel("Comment").fill("Looks good — approving.");

    // Submit. Atomically completes the task — navigation lands back at /tasks.
    await page.getByTestId("task-form-submit").click();
    await expect(page).toHaveURL(/\/tasks($|\?)/, { timeout: 10_000 });

    // The task is gone from the active list (engine completed it via the
    // form submission). Filter by the specific task id to avoid false
    // positives from other concurrent specs.
    await page.goto("/tasks?assignee=all");
    await expect(page.locator(`tr[data-task-id="${taskId}"]`)).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
