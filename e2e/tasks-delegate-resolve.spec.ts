/**
 * E2E — /tasks Delegate modal flow (Story 11.4).
 *
 * Per AC-9 defensible variant: the full two-user Delegate → Resolve dance
 * requires switching the connection config mid-test, which is complex to
 * wire reliably in Playwright. We ship the Delegate half here (single-user
 * flow that proves the modal swap is correct + the engine accepts the
 * delegate API call). The Resolve flow is exercised at the unit-test
 * layer (TaskDetail Resolve button visibility + click handler) and via
 * manual operator validation; a fully-automated Resolve E2E is tracked
 * as a deferred-work entry for the next user-switching helper to land.
 *
 *   1. Pre-seed an unassigned task via REST.
 *   2. Claim it via REST (so rest-admin is the assignee — the engine
 *      requires a current assignee to accept a delegate transition).
 *   3. Navigate to /tasks?assignee=me.
 *   4. Open the row ⋮ menu; click Delegate…. Assert the modal opens.
 *   5. Type kermit; click Delegate. Assert the modal closes, success toast.
 *   6. Switch back to ?assignee=me. Assert the task is no longer there
 *      (it's now assigned to kermit, rest-admin is the owner).
 *
 * Per Pattern P-009: real engine; no mocks. Cleanup unclaims any
 * remaining assigned task and cancels the parent instance.
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

async function claimTask(taskId: string): Promise<void> {
  await fetch(`${FLOWABLE}/runtime/tasks/${taskId}`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "claim", assignee: "rest-admin" }),
  });
}

async function findTaskForInstance(instanceId: string): Promise<FlowableTask | null> {
  const res = await fetch(`${FLOWABLE}/runtime/tasks?processInstanceId=${instanceId}&size=10`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as FlowablePage<FlowableTask>;
  return body.data[0] ?? null;
}

const BUSINESS_KEY = `e2e-11-4-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/tasks Delegate (Story 11.4)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
    // Claim the seeded task as rest-admin so it appears under ?assignee=me
    // and is in the right state for the delegate transition.
    const task = await findTaskForInstance(startedInstance.id);
    if (!task) throw new Error("Seed task not found");
    await claimTask(task.id);
  });

  test.afterAll(async () => {
    if (startedInstance) {
      await unclaimTasksForInstance(startedInstance.id);
      await cancelInstance(startedInstance.id);
    }
    await deleteFixtureDeployments();
  });

  test("Delegate modal: type assignee → confirm → success toast → row leaves /tasks?assignee=me", async ({
    page,
  }) => {
    await page.goto("/tasks?assignee=me");
    const row = page.locator("tr[data-task-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const taskId = await row.getAttribute("data-task-id");
    expect(taskId).toBeTruthy();

    // Open the row ⋮ menu and click Delegate….
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Delegate…" }).click();

    // Modal opens with the input + Confirm/Cancel buttons.
    await expect(page.getByTestId("delegate-task-modal")).toBeVisible();
    await expect(page.getByTestId("delegate-task-input")).toBeFocused();

    // Type the target user and click Delegate.
    await page.getByTestId("delegate-task-input").fill("kermit");
    await page.getByTestId("delegate-task-modal-confirm").click();

    // Modal closes; success toast fires.
    await expect(page.getByTestId("delegate-task-modal")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator(".toast").filter({ hasText: /Delegated:/ })).toBeVisible({
      timeout: 10_000,
    });

    // The task is no longer in ?assignee=me (kermit is the new assignee).
    await page.goto("/tasks?assignee=me");
    await expect(page.locator(`tr[data-task-id="${taskId}"]`)).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
