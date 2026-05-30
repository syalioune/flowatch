// SPDX-License-Identifier: Apache-2.0

/**
 * E2E — /tasks/$id attachment lifecycle (Story 21.3): download + delete.
 *
 * Pre-seeds 1 URL + 1 file attachment via the wrappers in beforeAll (NOT via
 * the UI — keeps the spec focused on download + delete). Then exercises the
 * row-action menu + the DeleteAttachmentModal alertdialog.
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
}
interface FlowableAttachmentResp {
  id: string;
  name?: string;
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

async function addUrlAttachment(
  taskId: string,
  name: string,
  externalUrl: string,
): Promise<FlowableAttachmentResp> {
  const res = await fetch(`${FLOWABLE}/runtime/tasks/${taskId}/attachments`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ name, externalUrl, type: "text/url" }),
  });
  if (!res.ok) throw new Error(`addUrlAttachment failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as FlowableAttachmentResp;
}

async function addFileAttachment(
  taskId: string,
  name: string,
  content: string,
): Promise<FlowableAttachmentResp> {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("type", "text/plain");
  fd.append("content", new Blob([content], { type: "text/plain" }), name);
  const res = await fetch(`${FLOWABLE}/runtime/tasks/${taskId}/attachments`, {
    method: "POST",
    headers: { Authorization: BASIC },
    body: fd,
  });
  if (!res.ok) throw new Error(`addFileAttachment failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as FlowableAttachmentResp;
}

const BUSINESS_KEY = `e2e-21-3-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;
let seedTaskId: string | null = null;
let urlAttachment: FlowableAttachmentResp | null = null;
let fileAttachment: FlowableAttachmentResp | null = null;

test.describe("/tasks/$id attachment lifecycle (Story 21.3)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
    const task = await findTaskForInstance(startedInstance.id);
    if (!task) throw new Error("Seed task not found");
    seedTaskId = task.id;
    urlAttachment = await addUrlAttachment(
      seedTaskId,
      "External dashboard",
      "https://example.com/dash",
    );
    fileAttachment = await addFileAttachment(seedTaskId, "lifecycle.txt", "hi");
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("Download file attachment triggers a browser download", async ({ page }) => {
    expect(seedTaskId).not.toBeNull();
    expect(fileAttachment).not.toBeNull();
    await page.goto(`/tasks/${seedTaskId}`);
    const panel = page.getByTestId("task-attachments-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const row = panel.locator(`tr[data-attachment-id="${fileAttachment?.id}"]`);
    await expect(row).toBeVisible();
    const trigger = row.getByTestId("row-action-trigger");
    await trigger.click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId(`attachment-download-${fileAttachment?.id}`).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lifecycle.txt");
  });

  test("Open link URL attachment opens a new tab with the externalUrl", async ({
    page,
    context,
  }) => {
    expect(urlAttachment).not.toBeNull();
    await page.goto(`/tasks/${seedTaskId}`);
    const panel = page.getByTestId("task-attachments-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const row = panel.locator(`tr[data-attachment-id="${urlAttachment?.id}"]`);
    await row.getByTestId("row-action-trigger").click();
    const newTabPromise = context.waitForEvent("page");
    await page.getByTestId(`attachment-download-${urlAttachment?.id}`).click();
    const newTab = await newTabPromise;
    expect(newTab.url()).toContain("example.com");
    await newTab.close();
  });

  test("Delete URL attachment: confirm → modal closes → row disappears", async ({ page }) => {
    // Re-seed because a previous test might have removed it; idempotent on existing.
    if (!urlAttachment)
      urlAttachment = await addUrlAttachment(seedTaskId ?? "", "tmp", "https://x");
    const id = urlAttachment.id;
    await page.goto(`/tasks/${seedTaskId}`);
    const panel = page.getByTestId("task-attachments-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const row = panel.locator(`tr[data-attachment-id="${id}"]`);
    await expect(row).toBeVisible();
    await row.getByTestId("row-action-trigger").click();
    await page.getByTestId(`attachment-delete-${id}`).click();
    const modal = page.getByTestId("delete-attachment-modal");
    await expect(modal).toBeVisible();
    await page.getByTestId("delete-attachment-confirm").click();
    await expect(modal).toBeHidden();
    await expect(panel.locator(`tr[data-attachment-id="${id}"]`)).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("ARIA: Delete modal carries role=alertdialog + aria-modal + aria-labelledby", async ({
    page,
  }) => {
    // Seed a fresh file attachment for this test to exercise.
    const fresh = await addFileAttachment(seedTaskId ?? "", "aria-probe.txt", "x");
    await page.goto(`/tasks/${seedTaskId}`);
    const panel = page.getByTestId("task-attachments-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const row = panel.locator(`tr[data-attachment-id="${fresh.id}"]`);
    await row.getByTestId("row-action-trigger").click();
    await page.getByTestId(`attachment-delete-${fresh.id}`).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete attachment?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "delete-attachment-title");
    await page.getByTestId("delete-attachment-cancel").click();
  });
});
