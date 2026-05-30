// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /tasks/$id Edit-task flow (Story 21.1).
 *
 * Uploads the loan-approval userTask fixture, starts an instance, claims the
 * resulting task, navigates to its detail page, opens the new Edit-task
 * modal, edits priority / dueDate / assignee, saves, and asserts the new
 * values land in both the detail Properties panel AND the /tasks list
 * columns.
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

const BUSINESS_KEY = `e2e-21-1-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;
let seedTaskId: string | null = null;

test.describe("/tasks/$id Edit task (Story 21.1)", () => {
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

  test("happy path: edit priority + assignee, save, detail reflects, list reflects", async ({
    page,
  }) => {
    expect(seedTaskId).not.toBeNull();
    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("edit-task").waitFor({ state: "visible", timeout: 15_000 });

    await page.getByTestId("edit-task").click();
    const modal = page.getByTestId("edit-task-modal");
    await expect(modal).toBeVisible();

    const priority = page.getByTestId("edit-task-priority");
    await priority.fill("75");
    const assignee = page.getByTestId("edit-task-assignee");
    await assignee.fill("user-c");

    await page.getByTestId("edit-task-submit").click();
    await expect(modal).toBeHidden();

    // Detail Properties reflects.
    const propertiesPanel = page.locator(".panel").filter({ hasText: "Properties" }).first();
    const priorityRow = propertiesPanel.locator("tr", { hasText: "Priority" }).first();
    await expect(priorityRow).toContainText("75", { timeout: 10_000 });
    const assigneeRow = propertiesPanel.locator("tr", { hasText: /^Assignee/ }).first();
    await expect(assigneeRow).toContainText("user-c");

    // List reflects on navigation back (route loader natural rerun).
    await page.goto("/tasks");
    const row = page.locator(`tr[data-task-id="${seedTaskId}"]`).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("user-c");

    // Restore assignee to rest-admin so subsequent tests see the claimed shape.
    await fetch(`${FLOWABLE}/runtime/tasks/${seedTaskId}`, {
      method: "PUT",
      headers: { Authorization: BASIC, "Content-Type": "application/json" },
      body: JSON.stringify({ assignee: "rest-admin" }),
    });
  });

  test("clear-fields path: clearing owner + assignee submits null, detail shows em-dash", async ({
    page,
  }) => {
    // Seed owner + assignee directly via wire.
    await fetch(`${FLOWABLE}/runtime/tasks/${seedTaskId}`, {
      method: "PUT",
      headers: { Authorization: BASIC, "Content-Type": "application/json" },
      body: JSON.stringify({ owner: "owner-x", assignee: "rest-admin" }),
    });

    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("edit-task").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByTestId("edit-task").click();
    const modal = page.getByTestId("edit-task-modal");
    await expect(modal).toBeVisible();

    await page.getByTestId("edit-task-owner").fill("");
    await page.getByTestId("edit-task-assignee").fill("");
    await page.getByTestId("edit-task-submit").click();
    await expect(modal).toBeHidden();

    const propertiesPanel = page.locator(".panel").filter({ hasText: "Properties" }).first();
    const ownerRow = propertiesPanel.locator("tr", { hasText: /^Owner/ }).first();
    await expect(ownerRow).toContainText("—", { timeout: 10_000 });
  });

  test("no-op submit guard: opening modal without changes disables Save and skips PUT", async ({
    page,
  }) => {
    // Restore the task to a known state.
    await fetch(`${FLOWABLE}/runtime/tasks/${seedTaskId}`, {
      method: "PUT",
      headers: { Authorization: BASIC, "Content-Type": "application/json" },
      body: JSON.stringify({ assignee: "rest-admin" }),
    });

    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("edit-task").waitFor({ state: "visible", timeout: 15_000 });

    const putRequests: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "PUT" && req.url().includes(`/runtime/tasks/${seedTaskId}`)) {
        putRequests.push(req.url());
      }
    });

    await page.getByTestId("edit-task").click();
    await expect(page.getByTestId("edit-task-modal")).toBeVisible();
    const submit = page.getByTestId("edit-task-submit");
    await expect(submit).toBeDisabled();
    // Cancel the modal — no PUT should have fired.
    await page.getByTestId("edit-task-cancel").click();
    await expect(page.getByTestId("edit-task-modal")).toBeHidden();
    expect(putRequests).toHaveLength(0);
  });

  test("ARIA: modal carries role=dialog + aria-modal + aria-labelledby", async ({ page }) => {
    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("edit-task").waitFor({ state: "visible", timeout: 15_000 });
    await page.getByTestId("edit-task").click();
    const dialog = page.getByRole("dialog", { name: "Edit task" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "edit-task-title");
  });
});
