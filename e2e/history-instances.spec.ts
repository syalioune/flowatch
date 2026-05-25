/**
 * E2E — /history?type=instances list + row navigation to /instances/{id}
 * (Story 13.1 AC-13).
 *
 * Pre-seeds: uploads the loan-approval fixture, starts a process instance,
 * then cancels it via REST so the engine archives it as a historic record.
 * Navigates to /history?type=instances, asserts the row appears, clicks
 * it, and asserts the unified detail page renders both the runtime panel's
 * "instance has ended" empty state AND the historic record.
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
  await fetch(`${FLOWABLE}/runtime/process-instances/${id}?deleteReason=e2e-13-1`, {
    method: "DELETE",
    headers: { Authorization: BASIC },
  });
}

const BUSINESS_KEY = `e2e-13-1-${Date.now()}`;
let endedInstance: FlowableProcessInstance | null = null;

test.describe("/history?type=instances + dual-fetch on /instances/$id (Story 13.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    endedInstance = await startInstance(BUSINESS_KEY);
    // Cancel immediately so the engine archives the instance and the
    // historic surface picks it up.
    await cancelInstance(endedInstance.id);
  });

  test.afterAll(async () => {
    await deleteFixtureDeployments();
  });

  test("the historic row is listed under the Instances tab", async ({ page }) => {
    await page.goto("/history?type=instances");
    const tab = page.locator('[data-testid="history-type-filter"] .seg-btn').first();
    await expect(tab).toHaveAttribute("data-on", "1");
    const row = page.locator(`tr[data-historic-instance-id="${endedInstance?.id}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator("td").first()).toContainText(BUSINESS_KEY);
  });

  test("clicking the historic row navigates to the unified /instances/{id} detail", async ({
    page,
  }) => {
    await page.goto("/history?type=instances");
    const row = page.locator(`tr[data-historic-instance-id="${endedInstance?.id}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator("td").first().click();
    await expect(page).toHaveURL(new RegExp(`/instances/${endedInstance?.id}$`));
    // Runtime panel renders the "instance has ended" empty state (404 → null).
    await expect(page.getByText("This instance has ended.")).toBeVisible({ timeout: 15_000 });
    // Historic panel mounts with its data-testid + an ended badge.
    await expect(page.getByTestId("historic-instance-panel")).toBeVisible();
    await expect(page.getByTestId("historic-instance-panel").getByText("ended")).toBeVisible();
  });

  test("switching tabs updates the URL and active segment (Story 13.3)", async ({ page }) => {
    await page.goto("/history?type=instances");
    const seg = page.locator('[data-testid="history-type-filter"] .seg-btn');
    // Story 13.3 ships three canonical-archetype tabs: Instances / Variables /
    // Tasks. The Activities tab is dropped in the follow-up chore(refactor)
    // commit; the assertion below pins that exactly three buttons are
    // rendered.
    await expect(seg).toHaveCount(3);
    // Variables tab
    await page
      .locator('[data-testid="history-type-filter"] .seg-btn', { hasText: "Variables" })
      .click();
    await expect(page).toHaveURL(/[?&]type=variables/);
    await expect(page.getByRole("columnheader", { name: "Variable" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("columnheader", { name: "Type" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Instance" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Task" })).toBeVisible();
    // Tasks tab
    await page
      .locator('[data-testid="history-type-filter"] .seg-btn', { hasText: "Tasks" })
      .click();
    await expect(page).toHaveURL(/[?&]type=tasks/);
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("columnheader", { name: "Assignee" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Started" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Ended" })).toBeVisible();
    // Back to Instances
    await page
      .locator('[data-testid="history-type-filter"] .seg-btn', { hasText: "Instances" })
      .click();
    await expect(page).toHaveURL(/[?&]type=instances/);
    // No Activities button present in the seg-row after the follow-up commit.
    await expect(
      page.locator('[data-testid="history-type-filter"] .seg-btn', { hasText: "Activities" }),
    ).toHaveCount(0);
  });
});
