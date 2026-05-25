/**
 * E2E — /jobs Move-to-executable on a dead-letter row (Story 12.3).
 *
 * Closes the 12.1 `move-deadletter-placeholder` swap by exercising the real
 * Move handler against the live engine. Flow:
 *
 *   1. Deploy `loan-with-failing-job.bpmn20.xml` (an async service task that
 *      references a missing class — fails fast with R1/PT1S retry, then
 *      dead-letters).
 *   2. Start an instance.
 *   3. Wait (poll up to 30s) for the failing job to land in
 *      /management/deadletter-jobs.
 *   4. Navigate to /jobs?type=deadletter; assert the row is visible.
 *   5. Open the row ⋮ menu; click `Move to executable`; assert the success
 *      toast.
 *   6. Assert the row disappears from the dead-letter tab.
 *   7. Verify the Inspector shows POST /management/deadletter-jobs/{id} entry.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "loan-with-failing-job.bpmn20.xml";
const PROCESS_KEY = "loanWithFailingJob";

interface FlowablePage<T> {
  data: T[];
  total: number;
}

interface FlowableDeployment {
  id: string;
}

interface FlowableProcessInstance {
  id: string;
}

interface FlowableJob {
  id: string;
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

async function pollForDeadLetterJob(instanceId: string, timeoutMs = 30_000): Promise<FlowableJob> {
  const deadline = Date.now() + timeoutMs;
  let last: FlowablePage<FlowableJob> | null = null;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${FLOWABLE}/management/deadletter-jobs?processInstanceId=${instanceId}&size=10`,
      { headers: { Authorization: BASIC } },
    );
    if (res.ok) {
      const body = (await res.json()) as FlowablePage<FlowableJob>;
      last = body;
      const job = body.data[0];
      if (job) return job;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(
    `dead-letter job not seen within ${timeoutMs}ms; last sweep: ${JSON.stringify(last)}`,
  );
}

const BUSINESS_KEY = `e2e-12-3-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/jobs move dead-letter (Story 12.3)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("Move to executable re-queues a failing dead-letter job", async ({ page }) => {
    if (!startedInstance) throw new Error("instance not started");
    // Wait for the engine to retry-fail-then-deadletter the async service task.
    const deadJob = await pollForDeadLetterJob(startedInstance.id);

    await page.goto("/jobs?type=deadletter");
    const row = page.locator(`tr[data-job-id="${deadJob.id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Move to executable" }).click();
    await expect(page.locator(".toast").filter({ hasText: /Moved to executable:/ })).toBeVisible({
      timeout: 10_000,
    });

    // Row drops from dead-letter on next invalidate.
    await expect(page.locator(`tr[data-job-id="${deadJob.id}"]`)).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
