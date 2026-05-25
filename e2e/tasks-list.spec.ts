/**
 * E2E — /tasks list with assignee filter + row actions (Story 11.1 → 11.5).
 *
 * Uploads the loan-approval fixture (it has a userTask first node, so the
 * started instance produces a task), starts an instance via REST, navigates
 * to /tasks?assignee=all, asserts the task row appears, clicks the
 * Unassigned filter, asserts URL transitions, opens the row's ⋮ menu,
 * then clicks the row body and asserts the URL transitions to /tasks/{id}.
 * Cleanup cancels the started instance and removes the fixture deployment.
 *
 * All four 11.1 placeholders are now real handlers:
 *   - Claim + Complete swapped in Story 11.2 (tasks-claim-complete.spec.ts).
 *   - Delegate swapped in Story 11.4 (tasks-delegate-resolve.spec.ts).
 *   - Unclaim swapped in Story 11.5 (task-unclaim.spec.ts).
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

const BUSINESS_KEY = `e2e-11-1-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/tasks list (Story 11.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("renders the running task row and switches filter via URL", async ({ page }) => {
    await page.goto("/tasks?assignee=all");
    const row = page.locator("tr[data-task-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The seeded task starts unassigned, so the Unassigned filter shows it too.
    await page.locator('[data-testid="tasks-assignee-filter"] >> text=Unassigned').click();
    await expect(page).toHaveURL(/\/tasks\?assignee=unassigned/);
    await expect(page.locator("tr[data-task-id]").first()).toBeVisible({ timeout: 15_000 });
  });

  test("⋮ menu surfaces the Delegate modal trigger; Unclaim hidden on unassigned row", async ({
    page,
  }) => {
    await page.goto("/tasks?assignee=all");
    const row = page.locator("tr[data-task-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Open the menu via the row's ⋮ trigger.
    await row.locator('[data-testid="row-action-trigger"]').click();
    // Delegate is a real modal trigger (Story 11.4); Unclaim is a real handler
    // (Story 11.5) but only visible when the row's assignee is the current
    // user. This row is unassigned, so Unclaim is hidden by predicate.
    await expect(page.getByRole("menuitem", { name: "Delegate…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Unclaim" })).toHaveCount(0);
  });

  test("clicking the row body navigates to /tasks/{id}", async ({ page }) => {
    await page.goto("/tasks?assignee=all");
    const row = page.locator("tr[data-task-id]").first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    // Click the task name cell (first column) — not the action menu cell.
    await row.locator("td").first().click();
    await expect(page).toHaveURL(/\/tasks\/[A-Za-z0-9-]+$/);
  });

  test("AC-6: warning toast when assignee=me has empty username", async ({ page }) => {
    // Seed an empty username in localStorage before the app boots so loadTasks
    // sees `cfg.username === ""` and the warning toast fires on mount. Keep
    // the rest of the canonical config so the engine probe stays green.
    await page.addInitScript(() => {
      localStorage.setItem(
        "flowatch.connection.v1",
        JSON.stringify({
          baseUrl: "/flowable-rest/service",
          username: "",
          password: "test",
          tenantId: "",
        }),
      );
    });
    await page.goto("/tasks?assignee=me");
    // Warning toast text per AC-6.
    await expect(page.locator(".toast").filter({ hasText: "No username configured" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
