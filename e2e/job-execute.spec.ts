/**
 * E2E — /jobs Execute on demand (Story 12.2).
 *
 * Closes the 12.1 `execute-job-placeholder` swap by exercising the real
 * Execute handler against the live engine. The flow:
 *
 *   1. Deploy `loan-with-timer.bpmn20.xml` (a far-future timer creates a
 *      timer-job).
 *   2. Start an instance — the engine puts a timer-job in /management/timer-jobs.
 *   3. Navigate to /jobs?type=timer; assert the row is visible.
 *   4. Open the row ⋮ menu; click `Execute now`; assert the "Executed:" toast.
 *   5. After settle, assert the row is gone (engine fired the timer and the
 *      job is removed).
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "loan-with-timer.bpmn20.xml";
const PROCESS_KEY = "loanWithTimer";

interface FlowablePage<T> {
  data: T[];
}

interface FlowableDeployment {
  id: string;
}

interface FlowableProcessInstance {
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

const BUSINESS_KEY = `e2e-12-2-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/jobs execute (Story 12.2)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("Execute now fires POST /management/jobs/{id} and removes the row", async ({ page }) => {
    await page.goto("/jobs?type=timer");
    const row = page.locator("tr[data-job-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    const jobId = await row.getAttribute("data-job-id");
    expect(jobId).toBeTruthy();

    // Open menu, click Execute now.
    await row.locator('[data-testid="row-action-trigger"]').click();
    await page.getByRole("menuitem", { name: "Execute now" }).click();
    await expect(page.locator(".toast").filter({ hasText: /Executed:/ })).toBeVisible({
      timeout: 10_000,
    });

    // After settling, the timer fires and the row drops from the timer tab.
    await expect(page.locator(`tr[data-job-id="${jobId}"]`)).toHaveCount(0, { timeout: 10_000 });
  });
});
