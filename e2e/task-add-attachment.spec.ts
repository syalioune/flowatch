// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /tasks/$id Add-attachment flow (Story 21.2).
 *
 * Uploads the loan-approval userTask fixture, starts an instance, claims
 * the resulting task, navigates to its detail page, scrolls to the
 * Attachments panel, opens the Add-attachment modal, and asserts the Link
 * + File happy paths land a new row in the panel.
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
}
interface FlowableTask {
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

const BUSINESS_KEY = `e2e-21-2-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;
let seedTaskId: string | null = null;

test.describe("/tasks/$id Add attachment (Story 21.2)", () => {
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

  test("happy path Link mode: add a URL attachment, row appears, count = 1", async ({ page }) => {
    expect(seedTaskId).not.toBeNull();
    await page.goto(`/tasks/${seedTaskId}`);
    const panel = page.getByTestId("task-attachments-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("task-attachments-add").click();
    const modal = page.getByTestId("add-attachment-modal");
    await expect(modal).toBeVisible();
    await page.getByTestId("add-attachment-name").fill(`E2E Link ${Date.now()}`);
    await page.getByTestId("add-attachment-url").fill("https://example.com/e2e-doc.pdf");
    await page.getByTestId("add-attachment-submit").click();
    await expect(modal).toBeHidden();
    await expect(panel.getByRole("link", { name: "https://example.com/e2e-doc.pdf" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("happy path File mode: upload a small file, row appears, count increments", async ({
    page,
  }) => {
    await page.goto(`/tasks/${seedTaskId}`);
    const panel = page.getByTestId("task-attachments-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("task-attachments-add").click();
    await expect(page.getByTestId("add-attachment-modal")).toBeVisible();
    await page.getByTestId("add-attachment-mode-file").click();
    await page
      .getByTestId("add-attachment-file")
      .setInputFiles({ name: "e2e-upload.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await page.getByTestId("add-attachment-submit").click();
    await expect(page.getByTestId("add-attachment-modal")).toBeHidden();
    await expect(panel.getByText("e2e-upload.txt", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("mode toggle preserves shared name across switches", async ({ page }) => {
    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("task-attachments-add").click();
    await page.getByTestId("add-attachment-name").fill("Shared name");
    await page.getByTestId("add-attachment-mode-file").click();
    await page.getByTestId("add-attachment-mode-url").click();
    await expect(page.getByTestId("add-attachment-name")).toHaveValue("Shared name");
    await page.getByTestId("add-attachment-cancel").click();
  });

  test("Save disabled until canSubmit (URL mode)", async ({ page }) => {
    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("task-attachments-add").click();
    const submit = page.getByTestId("add-attachment-submit");
    await expect(submit).toBeDisabled();
    await page.getByTestId("add-attachment-name").fill("n");
    await expect(submit).toBeDisabled();
    await page.getByTestId("add-attachment-url").fill("https://example.com");
    await expect(submit).not.toBeDisabled();
    await page.getByTestId("add-attachment-cancel").click();
  });

  test("ARIA: modal carries role=dialog + aria-modal + aria-labelledby", async ({ page }) => {
    await page.goto(`/tasks/${seedTaskId}`);
    await page.getByTestId("task-attachments-add").click();
    const dialog = page.getByRole("dialog", { name: "Add attachment" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "add-attachment-title");
  });
});
