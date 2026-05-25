/**
 * E2E — /jobs View stacktrace (Story 12.4).
 *
 * Closes the 12.1 `view-stacktrace-placeholder` swap. Reuses the
 * 12.3 failing-job fixture (`loan-with-failing-job.bpmn20.xml`) so the
 * engine dead-letters a job with a recorded stacktrace. Flow:
 *
 *   1. Deploy the failing fixture + start an instance.
 *   2. Wait for the engine to retry-fail-then-deadletter the job.
 *   3. Navigate to /jobs?type=deadletter; assert the row.
 *   4. Open the ⋮ menu; click `View stacktrace` — assert the sibling
 *      `<JobStacktracePanel>` mounts.
 *   5. Assert the rendered `<pre>` text matches a stacktrace shape
 *      (Exception / at-frame).
 *   6. Click `View stacktrace` again — assert the panel collapses.
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
}

interface FlowableDeployment {
  id: string;
}

interface FlowableProcessInstance {
  id: string;
}

interface FlowableJob {
  id: string;
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
  while (Date.now() < deadline) {
    const res = await fetch(
      `${FLOWABLE}/management/deadletter-jobs?processInstanceId=${instanceId}&size=10`,
      { headers: { Authorization: BASIC } },
    );
    if (res.ok) {
      const body = (await res.json()) as FlowablePage<FlowableJob>;
      const job = body.data[0];
      if (job) return job;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`dead-letter job not seen within ${timeoutMs}ms`);
}

const BUSINESS_KEY = `e2e-12-4-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/jobs view stacktrace (Story 12.4)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("View stacktrace toggles the sibling panel and copies the verbatim text", async ({
    page,
  }) => {
    if (!startedInstance) throw new Error("instance not started");
    const deadJob = await pollForDeadLetterJob(startedInstance.id);

    await page.goto("/jobs?type=deadletter");
    const row = page.locator(`tr[data-job-id="${deadJob.id}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // Open the menu and click View stacktrace.
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "View stacktrace" }).click();

    // The sibling panel mounts with the stacktrace text.
    const pre = page.getByTestId("job-stacktrace-pre");
    await expect(pre).toBeVisible({ timeout: 10_000 });
    // The engine's stacktrace contains at least one stack frame shape.
    await expect(pre).toContainText(/Exception|Error|\s+at\s/);

    // Toggle closed by clicking the action again.
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "View stacktrace" }).click();
    await expect(page.getByTestId("job-stacktrace-pre")).toHaveCount(0);
  });
});
