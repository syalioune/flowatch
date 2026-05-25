/**
 * E2E — /jobs list with three URL-driven tabs (Story 12.1 → 12.4).
 *
 * Uploads the loan-approval fixture (has a userTask, no async/timer/failing
 * service tasks, so the executable / timer / dead-letter tabs may all be
 * empty against a freshly-seeded engine — that's OK; this spec exercises
 * the route-level navigation surface and the placeholder forward-references).
 *
 * Placeholder cluster status (post-12.2): two placeholders remain.
 *   - Execute now → real handler in Story 12.2 (closed).
 *   - Move to executable → real handler in Story 12.3.
 *   - View stacktrace → real handler in Story 12.4.
 *
 * Per CLAUDE.md placeholder-then-real: each swap PR drops its corresponding
 * placeholder-toast assertion in this file.
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

const BUSINESS_KEY = `e2e-12-1-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/jobs list (Story 12.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("renders the canonical surface on /jobs?type=executable", async ({ page }) => {
    await page.goto("/jobs?type=executable");
    await expect(page.getByTestId("jobs-type-filter")).toBeVisible({ timeout: 15_000 });
    // The Jobs tab should be active.
    const jobsTab = page.locator(
      '[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Jobs")',
    );
    await expect(jobsTab).toHaveAttribute("data-on", "1");
  });

  test("URL-driven tab switching round-trips across executable / timer / deadletter", async ({
    page,
  }) => {
    await page.goto("/jobs?type=executable");
    await expect(page.getByTestId("jobs-type-filter")).toBeVisible({ timeout: 15_000 });

    // Switch to Timers.
    await page
      .locator('[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Timers")')
      .click();
    await expect(page).toHaveURL(/\/jobs\?type=timer/);
    await expect(
      page.locator('[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Timers")'),
    ).toHaveAttribute("data-on", "1");

    // Switch to Dead-letter.
    await page
      .locator('[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Dead-letter")')
      .click();
    await expect(page).toHaveURL(/\/jobs\?type=deadletter/);
    await expect(
      page.locator('[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Dead-letter")'),
    ).toHaveAttribute("data-on", "1");

    // Round-trip back to Jobs (executable).
    await page
      .locator('[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Jobs")')
      .click();
    await expect(page).toHaveURL(/\/jobs\?type=executable/);
    await expect(
      page.locator('[data-testid="jobs-type-filter"] >> button.seg-btn:has-text("Jobs")'),
    ).toHaveAttribute("data-on", "1");
  });

  test("empty-state shows when the executable tab has no rows for the canonical fixture", async ({
    page,
  }) => {
    await page.goto("/jobs?type=executable");
    await expect(page.getByTestId("jobs-type-filter")).toBeVisible({ timeout: 15_000 });
    // The loan-approval fixture has no async/service tasks → executable tab is
    // expected to be empty. The Execute placeholder click is replaced by the
    // real-handler E2E in e2e/job-execute.spec.ts (Story 12.2).
    const rows = page.locator("tr[data-job-id]");
    const count = await rows.count();
    if (count === 0) {
      await expect(page.getByTestId("empty-state")).toBeVisible();
    }
  });
});
