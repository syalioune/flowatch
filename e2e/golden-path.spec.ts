/**
 * E2E golden-path: deploy → start → claim → complete → history.
 *
 * Per ADR-008: the E2E tier exercises the full GUI → request() funnel → real
 * Flowable engine path. No mocking at any layer. The fixture lives at
 * e2e/fixtures/loan-approval.bpmn20.xml.
 *
 * Per ADR-012: targets flowable-rest:7.2.0 (per docker-compose.yml).
 *
 * Per P-009: no mock fixtures in app code; the only stub is the test BPMN
 * file, which is a real deployable artifact, not a mock.
 *
 * Deviation from spec AC-5 step 2 (deploy via the GUI upload form): the
 * Deployments screen is currently read-only — the upload UI lands in Story
 * 9.2 (Epic 9). For this story the deployment is performed via direct REST
 * in `beforeAll`. The GUI-driven path then covers definitions → start →
 * instances → tasks (claim + complete) → history, exercising the request()
 * funnel for every operator action.
 *
 * See: _bmad-output/planning-artifacts/architecture.md#adr-008
 *      _bmad-output/planning-artifacts/architecture.md#p-009
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;

async function deleteFixtureDeployments() {
  const res = await fetch(`${FLOWABLE}/repository/deployments?name=loan-approval&size=100`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return;
  const body = (await res.json()) as { data: Array<{ id: string }> };
  for (const dep of body.data) {
    await fetch(`${FLOWABLE}/repository/deployments/${dep.id}?cascade=true`, {
      method: "DELETE",
      headers: { Authorization: BASIC },
    });
  }
}

async function deployFixture() {
  const fixturePath = resolve("e2e/fixtures/loan-approval.bpmn20.xml");
  const xml = readFileSync(fixturePath);
  const form = new FormData();
  form.append(
    "deployment",
    new Blob([xml], { type: "application/xml" }),
    "loan-approval.bpmn20.xml",
  );
  const res = await fetch(`${FLOWABLE}/repository/deployments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Fixture deploy failed: ${res.status} ${await res.text()}`);
  }
}

test.beforeAll(async () => {
  await deleteFixtureDeployments();
  await deployFixture();
});

test.afterAll(async () => {
  await deleteFixtureDeployments();
});

test("operator golden path: definitions → start → instance → claim → complete → history", async ({
  page,
}) => {
  await page.goto("/");
  // Sidebar shows the Dashboard label on initial load.
  await expect(page.getByText("Dashboard", { exact: true }).first()).toBeVisible();

  // ── 1. Process definitions: locate the deployed Loan Approval row.
  await page.locator(".nav-item").filter({ hasText: "Process definitions" }).click();
  const defRow = page
    .locator("table.tbl tbody tr")
    .filter({ has: page.getByText("Loan Approval", { exact: true }) })
    .first();
  await expect(defRow).toBeVisible({ timeout: 15_000 });

  // Story 9.4 replaced the inline per-row Start button with a placeholder
  // menu item that toasts the forward-reference to Story 10.2. Until the
  // real Start Instance modal lands, this E2E starts the instance via the
  // REST API directly — the value of the golden path is the
  // claim/complete/history surface, not the Start UI (which 10.2 owns).
  const defKey = "loanApproval";
  const startRes = await fetch(`${FLOWABLE}/runtime/process-instances`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ processDefinitionKey: defKey }),
  });
  if (!startRes.ok) {
    throw new Error(`Failed to start instance: ${startRes.status} ${await startRes.text()}`);
  }

  // ── 2. Process instances: confirm the new instance is in the list
  await page.locator(".nav-item").filter({ hasText: "Process instances" }).click();
  const instanceRow = page
    .locator("table.tbl tbody tr")
    .filter({ hasText: "Loan Approval" })
    .first();
  await expect(instanceRow).toBeVisible({ timeout: 15_000 });

  // ── 3. Tasks: select the userTask, claim, complete
  await page.locator(".nav-item").filter({ hasText: "Tasks", hasNotText: "Process" }).click();

  // The Tasks screen defaults to filter="all". The first task with "Approve loan"
  // belongs to the instance we just started.
  const allFilter = page.locator(".seg-btn").filter({ hasText: "All" });
  await allFilter.click();

  const taskCard = page.locator(".panel > div > div").filter({ hasText: "Approve loan" }).first();
  await expect(taskCard).toBeVisible({ timeout: 15_000 });
  await taskCard.click();

  // The right-side panel reveals Claim + Complete. Claim first (it's unassigned).
  const claimBtn = page.getByRole("button", { name: /^Claim$/ });
  await expect(claimBtn).toBeVisible();
  await claimBtn.click();

  // After claim, the Complete button is the primary action.
  const completeBtn = page.getByRole("button", { name: /^Complete$/ });
  await expect(completeBtn).toBeVisible();
  await completeBtn.click();

  // TaskDetail.complete() awaits the REST call THEN navigates to /tasks.
  // Wait for that navigation to land before clicking History — otherwise
  // the delayed navigate({to:"/tasks"}) clobbers the History click.
  // Match /tasks optionally followed by a query string (the "All" filter
  // earlier set ?assignee=all, which TanStack Router preserves).
  await expect(page).toHaveURL(/\/tasks(\?|$)/);

  // ── 4. History: completed instance appears
  await page.locator(".nav-item").filter({ hasText: "History" }).click();
  const historicRow = page
    .locator("table.tbl tbody tr")
    .filter({ hasText: "Loan Approval" })
    .first();
  await expect(historicRow).toBeVisible({ timeout: 15_000 });
});
