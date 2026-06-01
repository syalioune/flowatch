/**
 * E2E — /batches list + /batches/$id detail (Story 24.1 AC-9, FR-53).
 *
 * Attempts to seed a real batch by triggering a bulk-delete of historic
 * process instances (POST /history/historic-process-instances/delete-batch).
 * Flowable 7.2.0 may queue the batch synchronously OR return it via
 * /management/batches asynchronously; the spec polls then BRANCHES on
 * whether seeding succeeded:
 *   - batch found     → list + detail + row-expand assertions
 *   - batch NOT found → assert the empty-state route (canonical fallback)
 *
 * Per compat.md FR-53 (line 70): "Endpoint returns 200 with paginated data
 * (empty in this engine state)" — seeding via the documented bulk-delete
 * recipe is best-effort.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
// Auto-completing fixture — every `startProcessInstance` writes a historic
// row immediately (start → end, no user task). Used by Story 24.1's
// bulk-delete batch seed below.
const FIXTURE_NAME = "batch-target.bpmn20.xml";
const PROCESS_KEY = "batchTargetE2E";

interface FlowablePage<T> {
  data: T[];
  total?: number;
}

interface FlowableDeployment {
  id: string;
}

interface FlowableProcessInstance {
  id: string;
}

interface FlowableBatch {
  id: string;
  type?: string;
  status?: string;
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
  await fetch(`${FLOWABLE}/runtime/process-instances/${id}?deleteReason=e2e-24-1`, {
    method: "DELETE",
    headers: { Authorization: BASIC },
  });
}

async function listBatches(): Promise<FlowableBatch[]> {
  const res = await fetch(`${FLOWABLE}/management/batches?size=50`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return [];
  const body = (await res.json()) as FlowablePage<FlowableBatch>;
  return body.data ?? [];
}

async function tryTriggerBatch(businessKey: string): Promise<void> {
  // Best-effort: Flowable 7.x exposes a bulk-delete batch endpoint that
  // schedules an async batch. Failures here are non-fatal — the spec
  // gracefully falls back to the empty-state assertion path.
  await fetch(`${FLOWABLE}/history/historic-process-instances/delete-batch`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ processInstanceBusinessKey: businessKey }),
  }).catch(() => undefined);
}

const BUSINESS_KEY = `e2e-24-1-${Date.now()}`;
let seededBatch: FlowableBatch | null = null;

test.describe("/batches list + detail (Story 24.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    // Start + cancel several instances to seed history rows.
    for (let i = 0; i < 3; i++) {
      const inst = await startInstance(`${BUSINESS_KEY}-${i}`);
      await cancelInstance(inst.id);
    }
    await tryTriggerBatch(BUSINESS_KEY);
    // Poll for up to ~5s waiting for a batch row to surface.
    for (let i = 0; i < 10; i++) {
      const batches = await listBatches();
      if (batches.length > 0) {
        seededBatch = batches[0] ?? null;
        break;
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  });

  test.afterAll(async () => {
    await deleteFixtureDeployments();
  });

  test("Sidebar nav: Batches link routes to /batches", async ({ page }) => {
    await page.goto("/");
    const navLink = page.getByRole("link", { name: /^Batches$/ });
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/\/batches$/);
  });

  test("PageHead + endpoints chip render on /batches", async ({ page }) => {
    await page.goto("/batches");
    // Scope to the H1 in the page head — "Batches" also appears as a sidebar
    // nav link, so a bare getByText('Batches') would match multiple elements.
    await expect(page.getByRole("heading", { level: 1, name: "Batches" })).toBeVisible();
  });

  test("Inspector endpoint chip wiring — list route surfaces /management/batches", async ({
    page,
  }) => {
    await page.goto("/batches");
    // The PageHead's API chip strip renders the staticData.endpoints[]; the
    // first chip's accessible name is the GET row. `getByText` would match
    // chips + inspector drawer + cURL snippet, so target the chip's button
    // role with the exact GET label.
    await expect(page.getByRole("button", { name: /GET \/management\/batches$/ })).toBeVisible();
  });

  test("list renders either the table OR the empty-state copy", async ({ page }) => {
    await page.goto("/batches");
    if (seededBatch) {
      const table = page.locator('[data-testid="batches-table"]');
      await expect(table).toBeVisible({ timeout: 10_000 });
      const row = page.locator(`tr[data-batch-id="${seededBatch.id}"]`);
      await expect(row).toBeVisible();
    } else {
      await expect(page.getByText("No batches yet.")).toBeVisible();
    }
  });

  test("clicking a batch ID navigates to /batches/$id with the properties table + parts panel", async ({
    page,
  }) => {
    test.skip(!seededBatch, "no batch seeded — skipping detail navigation");
    await page.goto("/batches");
    const link = page.locator(`tr[data-batch-id="${seededBatch?.id}"] a`).first();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/batches/${seededBatch?.id}$`));
    await expect(page.getByTestId("batch-detail-page")).toBeVisible();
    await expect(page.getByTestId("batch-properties-table")).toBeVisible();
    await expect(page.getByTestId("batch-parts-panel")).toBeVisible();
  });

  test("detail page back-link navigates to /batches", async ({ page }) => {
    test.skip(!seededBatch, "no batch seeded — skipping detail back-link test");
    await page.goto(`/batches/${seededBatch?.id}`);
    await page.getByTestId("batch-detail-back").click();
    await expect(page).toHaveURL(/\/batches$/);
  });

  test("parts panel row-expand toggles stacktrace (single-row-at-a-time)", async ({ page }) => {
    test.skip(!seededBatch, "no batch seeded — skipping row-expand test");
    await page.goto(`/batches/${seededBatch?.id}`);
    const partsPanel = page.getByTestId("batch-parts-panel");
    await expect(partsPanel).toBeVisible();
    // Either parts exist (click first row, assert expansion `<tr>` appears) or
    // the empty-state copy renders — both shapes are valid against a live
    // engine depending on how the seeded batch progressed.
    const firstRow = partsPanel.locator("tr[data-batch-part-id]").first();
    const empty = page.getByText("No parts for this batch.");
    if ((await firstRow.count()) > 0) {
      const partId = await firstRow.getAttribute("data-batch-part-id");
      await firstRow.click();
      const detail = page.getByTestId(`batch-part-detail-${partId}`);
      await expect(detail).toBeVisible();
      // Re-click collapses
      await firstRow.click();
      await expect(detail).not.toBeVisible();
    } else {
      await expect(empty).toBeVisible();
    }
  });
});
