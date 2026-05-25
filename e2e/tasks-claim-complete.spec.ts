/**
 * E2E — /tasks Claim + Complete row actions (Story 11.2).
 *
 * Closes the 11.1 placeholder swap by exercising the real Claim and Complete
 * handlers against the live engine. The flow:
 *
 *   1. Pre-seed an unassigned task via REST POST to /runtime/process-instances
 *      (loan-approval fixture has a userTask first node).
 *   2. Navigate to /tasks?assignee=unassigned; assert the seeded task is visible.
 *   3. Open the row ⋮ menu; click Claim; assert the success toast.
 *   4. Navigate to /tasks?assignee=me; assert the task is visible (proves the
 *      claim landed at the engine).
 *   5. Open the row ⋮ menu; click Complete; assert the success toast; assert
 *      the row disappears from the active list.
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

interface FlowableTask {
  id: string;
  assignee?: string;
  processInstanceId?: string;
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

async function unclaimTasksForInstance(instanceId: string): Promise<void> {
  const res = await fetch(`${FLOWABLE}/runtime/tasks?processInstanceId=${instanceId}&size=10`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as FlowablePage<FlowableTask>;
  for (const t of body.data) {
    if (t.assignee) {
      await fetch(`${FLOWABLE}/runtime/tasks/${t.id}`, {
        method: "POST",
        headers: { Authorization: BASIC, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unclaim" }),
      });
    }
  }
}

const BUSINESS_KEY = `e2e-11-2-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/tasks claim + complete (Story 11.2)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) {
      // Defensive cleanup: unclaim any remaining assigned task before
      // cancelling, so the engine doesn't refuse the cancel because of an
      // assigned active task. cancelInstance ignores 404 if the instance
      // already completed via the UI's Complete handler.
      await unclaimTasksForInstance(startedInstance.id);
      await cancelInstance(startedInstance.id);
    }
    // Load-bearing cleanup: cascade-delete removes the fixture deployment
    // and any leftover instance state regardless of the prior unclaim/cancel
    // outcome. This is the safety net for cross-spec isolation.
    await deleteFixtureDeployments();
  });

  test("claim → see in 'Mine' → complete → row gone", async ({ page }) => {
    // Step 1: navigate to ?assignee=unassigned and find the seeded task.
    await page.goto("/tasks?assignee=unassigned");
    const row = page.locator("tr[data-task-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const taskId = await row.getAttribute("data-task-id");
    expect(taskId).toBeTruthy();

    // Step 2: open the ⋮ menu and click Claim.
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Claim" }).click();
    await expect(page.locator(".toast").filter({ hasText: /Claimed:/ })).toBeVisible({
      timeout: 10_000,
    });

    // Step 3: switch to ?assignee=me — the same task should appear (proves the
    // claim landed at the engine).
    await page.goto("/tasks?assignee=me");
    const mineRow = page.locator(`tr[data-task-id="${taskId}"]`).first();
    await expect(mineRow).toBeVisible({ timeout: 15_000 });

    // Step 4: open the ⋮ menu and click Complete.
    await mineRow.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Complete" }).click();
    await expect(page.locator(".toast").filter({ hasText: /Completed:/ })).toBeVisible({
      timeout: 10_000,
    });

    // Step 5: the row should disappear from the active list once the engine
    // settles. Allow up to 10s for the router invalidation to land.
    await expect(page.locator(`tr[data-task-id="${taskId}"]`)).toHaveCount(0, { timeout: 10_000 });
  });
});
