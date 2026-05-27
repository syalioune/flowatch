/**
 * E2E — /tasks Unclaim row action (Story 11.5).
 *
 * Closes the 11.1 Unclaim placeholder by exercising the real handler
 * against the live engine. The flow:
 *
 *   1. Pre-seed an unassigned task via REST.
 *   2. Claim it as rest-admin via REST.
 *   3. Navigate to /tasks?assignee=me; assert the task is visible.
 *   4. Open the row ⋮ menu; assert Unclaim is visible.
 *   5. Click Unclaim; assert success toast.
 *   6. Navigate to /tasks?assignee=unassigned; assert the task is visible
 *      (engine cleared the assignee).
 *
 * Per Pattern P-009: real engine; no mocks. Cleanup cancels the parent
 * instance regardless of outcome.
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

async function findTaskForInstance(instanceId: string): Promise<FlowableTask | null> {
  const res = await fetch(`${FLOWABLE}/runtime/tasks?processInstanceId=${instanceId}&size=10`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as FlowablePage<FlowableTask>;
  return body.data[0] ?? null;
}

async function claimTask(taskId: string): Promise<void> {
  await fetch(`${FLOWABLE}/runtime/tasks/${taskId}`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "claim", assignee: "rest-admin" }),
  });
}

const BUSINESS_KEY = `e2e-11-5-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;
let seedTaskId: string | null = null;

test.describe("/tasks Unclaim (Story 11.5)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
    const task = await findTaskForInstance(startedInstance.id);
    if (!task) throw new Error("Seed task not found");
    seedTaskId = task.id;
    await claimTask(task.id);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("Unclaim: row in /me → click Unclaim → success toast → row in /unassigned", async ({
    page,
  }) => {
    expect(seedTaskId).not.toBeNull();
    await page.goto("/tasks?assignee=me");
    const row = page.locator(`tr[data-task-id="${seedTaskId}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Capture toasts via the window event — the rendered `.toast` element has
    // a 3s TTL and may have disappeared before the assertion catches it.
    await page.evaluate(() => {
      const w = window as unknown as { __captured?: string[] };
      w.__captured = [];
      window.addEventListener("app:toast", (e) => {
        const detail = (e as CustomEvent<{ text?: string }>).detail;
        if (detail?.text) w.__captured?.push(detail.text);
      });
    });

    // Open the ⋮ menu; Unclaim should be visible because the operator is the
    // current assignee. Use Playwright's native click (which dispatches a
    // proper mousedown → mouseup → click sequence matching the React event
    // model). The mousedown-close handler in RowActionMenu checks if the
    // event target is inside menuRef — since the `<li>` IS inside the menu,
    // the close path doesn't fire.
    await row.locator('[data-testid="row-action-trigger"]').click();
    const unclaim = page.getByRole("menuitem", { name: "Unclaim" });
    await expect(unclaim).toBeVisible();
    await unclaim.click();

    // Wait for any toast event to fire then verify it's the success toast.
    // If the unclaim succeeded, we see "Unclaimed: <name>". If the engine
    // rejected, we see "Unclaim failed" — log it for debug.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { __captured?: string[] };
        return (w.__captured ?? []).length > 0;
      },
      undefined,
      { timeout: 10_000 },
    );
    const captured = (await page.evaluate(
      () => (window as unknown as { __captured?: string[] }).__captured ?? [],
    )) as string[];
    expect(captured, `captured toasts: ${JSON.stringify(captured)}`).toEqual(
      expect.arrayContaining([expect.stringMatching(/Unclaimed:/)]),
    );

    // Task should now be in the unassigned filter (engine cleared assignee).
    await page.goto("/tasks?assignee=unassigned");
    await expect(page.locator(`tr[data-task-id="${seedTaskId}"]`)).toBeVisible({
      timeout: 10_000,
    });
  });
});
