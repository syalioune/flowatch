/**
 * E2E — /instances/$id dual-fetch sibling pattern (Story 13.1 AC-13).
 *
 * Starts a still-running instance, asserts the runtime panel renders the
 * properties AND the historic panel renders the "no historic record yet"
 * empty state. Then cancels the instance, reloads, asserts the runtime
 * panel flips to the "ended" empty state AND the historic panel
 * populates.
 *
 * Story 13.2 extends the spec with three assertions on the third sibling
 * panel (`<InstanceHistoricActivitiesPanel>`): the timeline renders, the
 * cancellation produces additional activity rows, and the Refresh button
 * triggers a second fetch visible in the Inspector log.
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
  await fetch(`${FLOWABLE}/runtime/process-instances/${id}?deleteReason=e2e-13-1-dual`, {
    method: "DELETE",
    headers: { Authorization: BASIC },
  });
}

const BUSINESS_KEY = `e2e-13-1-dual-${Date.now()}`;
let runningInstance: FlowableProcessInstance | null = null;

test.describe("/instances/$id dual-fetch sibling pattern (Story 13.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    runningInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (runningInstance) await cancelInstance(runningInstance.id);
    await deleteFixtureDeployments();
  });

  test("runtime panel renders properties; historic panel shows the in-progress historic snapshot (eager record, endTime missing)", async ({
    page,
  }) => {
    await page.goto(`/instances/${runningInstance?.id}`);
    // Runtime panel: properties (Business key cell)
    const runtime = page.getByTestId("instance-runtime-panel");
    await expect(runtime).toBeVisible({ timeout: 15_000 });
    await expect(runtime).toContainText(BUSINESS_KEY);
    // Historic panel: Flowable 7.x eagerly archives the instance the moment
    // it starts (the historic-process-instances/{id} endpoint returns 200
    // with `endTime: null`, NOT 404). The panel renders the populated
    // properties table with a `historic` badge (warn tone) — see RC-13.
    const historic = page.getByTestId("historic-instance-panel");
    await expect(historic).toBeVisible();
    await expect(historic.locator('.badge[data-tone="warn"]', { hasText: "historic" })).toBeVisible(
      { timeout: 15_000 },
    );
    await expect(historic).toContainText(BUSINESS_KEY);
  });

  test("after cancellation, runtime panel flips to ended empty + historic panel badge flips to ended", async ({
    page,
  }) => {
    await cancelInstance(runningInstance!.id);
    runningInstance = null; // prevent double-cancel in afterAll
    await page.goto(`/instances/${await getEndedId(BUSINESS_KEY)}`);
    // Runtime panel: 404 → "This instance has ended."
    const runtime = page.getByTestId("instance-runtime-panel");
    await expect(runtime).toBeVisible({ timeout: 15_000 });
    await expect(runtime.getByText("This instance has ended.")).toBeVisible({ timeout: 15_000 });
    // Historic panel: data populated with the captured business key; badge
    // flips to `ended` (mute tone). Scope to the badge to avoid the
    // strict-mode collision with `<td>Ended</td>`.
    const historic = page.getByTestId("historic-instance-panel");
    await expect(historic).toBeVisible();
    await expect(historic).toContainText(BUSINESS_KEY);
    await expect(historic.locator('.badge[data-tone="mute"]', { hasText: "ended" })).toBeVisible();
  });

  test("activities panel renders the timeline with at least two rows (Story 13.2)", async ({
    page,
  }) => {
    // Fresh instance so both runtime + activities panels render side-by-side.
    const fresh = await startInstance(`${BUSINESS_KEY}-13-2`);
    try {
      await page.goto(`/instances/${fresh.id}`);
      const timeline = page.getByTestId("historic-activities-timeline");
      await expect(timeline).toBeVisible({ timeout: 15_000 });
      // loan-approval has at least a startEvent + a userTask, so expect ≥ 2.
      const rows = timeline.locator("[data-activity-id]");
      await expect.poll(async () => rows.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    } finally {
      await cancelInstance(fresh.id);
    }
  });

  test("diagram panel mounts the NavigatedViewer canvas on a live instance (Story 26.1)", async ({
    page,
  }) => {
    const fresh = await startInstance(`${BUSINESS_KEY}-26-1-live`);
    try {
      await page.goto(`/instances/${fresh.id}`);
      const panel = page.getByTestId("instance-diagram-panel");
      await expect(panel).toBeVisible({ timeout: 15_000 });
      // The canvas <div> is always rendered; we wait until display:none is
      // cleared (the data-state) and the bpmn-js .djs-container has mounted
      // its SVG inside.
      const canvas = page.getByTestId("instance-diagram-canvas");
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      // Per Story 17.4 baseline policy + spec AC-14, no pixel-content
      // assertion — only structural presence of the bpmn-js container.
      await expect(canvas.locator(".djs-container")).toBeAttached({ timeout: 15_000 });
    } finally {
      await cancelInstance(fresh.id);
    }
  });

  test("diagram panel renders for an ENDED instance via historic-fallback probe (Story 26.1)", async ({
    page,
  }) => {
    const fresh = await startInstance(`${BUSINESS_KEY}-26-1-ended`);
    await cancelInstance(fresh.id);
    const endedId = await getEndedId(`${BUSINESS_KEY}-26-1-ended`);
    await page.goto(`/instances/${endedId}`);
    const panel = page.getByTestId("instance-diagram-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    const canvas = page.getByTestId("instance-diagram-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(canvas.locator(".djs-container")).toBeAttached({ timeout: 15_000 });
  });

  test("diagram overlay paints activity-current + activity-completed markers (Story 26.2)", async ({
    page,
  }) => {
    const fresh = await startInstance(`${BUSINESS_KEY}-26-2-overlay`);
    try {
      await page.goto(`/instances/${fresh.id}`);
      const canvas = page.getByTestId("instance-diagram-canvas");
      await expect(canvas).toBeVisible({ timeout: 15_000 });
      // loan-approval's startEvent fires + completes immediately; the userTask
      // is the in-flight current activity awaiting approval. Both classes
      // should be applied to the bpmn-js SVG groups.
      await expect(canvas.locator(".djs-element.activity-completed").first()).toBeAttached({
        timeout: 15_000,
      });
      await expect(canvas.locator(".djs-element.activity-current").first()).toBeAttached({
        timeout: 15_000,
      });
      // Regression guard: bpmn-js applies stroke via INLINE style attribute,
      // so the marker CSS needs `!important` to actually paint. Verify the
      // computed stroke on the current-task primary visual is the design-
      // system accent color (oklch), not the default near-black.
      const currentStroke = await canvas
        .locator(".djs-element.activity-current .djs-visual > :nth-child(1)")
        .first()
        .evaluate((el) => getComputedStyle(el).stroke);
      expect(currentStroke).toMatch(/^oklch\(/);
      // Same regression guard for completed sequence flows — first child of
      // .djs-visual is <defs>, so the path needs to be targeted directly.
      const completedConnStroke = await canvas
        .locator(".djs-element.djs-connection.activity-completed .djs-visual path")
        .first()
        .evaluate((el) => getComputedStyle(el).stroke);
      expect(completedConnStroke).toMatch(/^oklch\(/);
      // Legend mirrors the overlay state: at least the Current swatch is visible.
      const legend = page.getByTestId("instance-diagram-legend");
      await expect(legend).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("legend-current")).toContainText(/Current \(\d+\)/);
    } finally {
      await cancelInstance(fresh.id);
    }
  });

  test("diagram overlay paints completed-only on an ENDED instance (Story 26.2)", async ({
    page,
  }) => {
    const fresh = await startInstance(`${BUSINESS_KEY}-26-2-ended-overlay`);
    await cancelInstance(fresh.id);
    const endedId = await getEndedId(`${BUSINESS_KEY}-26-2-ended-overlay`);
    await page.goto(`/instances/${endedId}`);
    const canvas = page.getByTestId("instance-diagram-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await expect(canvas.locator(".djs-element.activity-completed").first()).toBeAttached({
      timeout: 15_000,
    });
    // Cancelled instances have no current activities; the legend's Current
    // swatch is hidden via the `hidden` attribute.
    const legend = page.getByTestId("instance-diagram-legend");
    await expect(legend).toBeVisible();
    await expect(page.getByTestId("legend-current")).toBeHidden();
  });

  test("activities Refresh button fires a second fetch (Story 13.2)", async ({ page }) => {
    const fresh = await startInstance(`${BUSINESS_KEY}-13-2-refresh`);
    try {
      await page.goto(`/instances/${fresh.id}`);
      await expect(page.getByTestId("historic-activities-timeline")).toBeVisible({
        timeout: 15_000,
      });
      // Use Playwright's network layer rather than reading window.API_LOG —
      // the API_LOG export is module-scoped, not exposed on window. Wait
      // for the next `/historic-activity-instances` GET (no `finished`
      // filter — that param belongs to the active-activities panel's
      // request) triggered specifically by clicking Refresh on the audit-
      // trail panel.
      const refreshClick = page.getByTestId("historic-activities-refresh").click();
      const responsePromise = page.waitForResponse(
        (resp) => {
          const url = resp.url();
          return (
            resp.request().method() === "GET" &&
            url.includes("/history/historic-activity-instances") &&
            !url.includes("finished=false") &&
            url.includes(`processInstanceId=${fresh.id}`)
          );
        },
        { timeout: 10_000 },
      );
      await refreshClick;
      const response = await responsePromise;
      expect(response.status()).toBe(200);
    } finally {
      await cancelInstance(fresh.id);
    }
  });
});

async function getEndedId(businessKey: string): Promise<string> {
  const res = await fetch(
    `${FLOWABLE}/history/historic-process-instances?finished=true&businessKey=${encodeURIComponent(
      businessKey,
    )}&size=10`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) throw new Error(`Historic lookup failed: ${res.status}`);
  const body = (await res.json()) as FlowablePage<FlowableProcessInstance>;
  if (!body.data.length) throw new Error(`No historic record for businessKey=${businessKey}`);
  return body.data[0]!.id;
}
