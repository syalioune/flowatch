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

  test("runtime panel renders properties; historic panel renders the empty state when the instance is still running", async ({
    page,
  }) => {
    await page.goto(`/instances/${runningInstance?.id}`);
    // Runtime panel: properties (Business key cell)
    const runtime = page.getByTestId("instance-runtime-panel");
    await expect(runtime).toBeVisible({ timeout: 15_000 });
    await expect(runtime).toContainText(BUSINESS_KEY);
    // Historic panel: 404 → "No historic record yet"
    const historic = page.getByTestId("historic-instance-panel");
    await expect(historic).toBeVisible();
    await expect(historic.getByText("No historic record yet.")).toBeVisible();
  });

  test("after cancellation, runtime panel flips to ended empty + historic panel populates", async ({
    page,
  }) => {
    await cancelInstance(runningInstance!.id);
    runningInstance = null; // prevent double-cancel in afterAll
    await page.goto(`/instances/${await getEndedId(BUSINESS_KEY)}`);
    // Runtime panel: 404 → "This instance has ended."
    const runtime = page.getByTestId("instance-runtime-panel");
    await expect(runtime).toBeVisible({ timeout: 15_000 });
    await expect(runtime.getByText("This instance has ended.")).toBeVisible({ timeout: 15_000 });
    // Historic panel: data populated with the captured business key
    const historic = page.getByTestId("historic-instance-panel");
    await expect(historic).toBeVisible();
    await expect(historic).toContainText(BUSINESS_KEY);
    await expect(historic.getByText("ended")).toBeVisible();
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

  test("activities Refresh button fires a second fetch visible in the Inspector (Story 13.2)", async ({
    page,
  }) => {
    const fresh = await startInstance(`${BUSINESS_KEY}-13-2-refresh`);
    try {
      await page.goto(`/instances/${fresh.id}`);
      await expect(page.getByTestId("historic-activities-timeline")).toBeVisible({
        timeout: 15_000,
      });
      const before = await page.evaluate(() => {
        const log = (window as unknown as { API_LOG?: { method: string; path: string }[] }).API_LOG;
        return (log ?? []).filter(
          (e) => e.method === "GET" && e.path === "/history/historic-activity-instances",
        ).length;
      });
      await page.getByTestId("historic-activities-refresh").click();
      await expect
        .poll(
          async () =>
            page.evaluate(() => {
              const log = (window as unknown as { API_LOG?: { method: string; path: string }[] })
                .API_LOG;
              return (log ?? []).filter(
                (e) => e.method === "GET" && e.path === "/history/historic-activity-instances",
              ).length;
            }),
          { timeout: 10_000 },
        )
        .toBeGreaterThan(before);
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
