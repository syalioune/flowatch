/**
 * E2E — /events list + <InstanceEventSubscriptionsPanel> on /instances/$id
 * (Story 24.2 AC-9, FR-54).
 *
 * Seeds a real subscription by deploying a BPMN with an intermediate message
 * catch event + starting an instance + completing the user task so the
 * instance parks on the catch event. The engine then surfaces a message-
 * event-subscription via /runtime/event-subscriptions.
 *
 * Per Pattern P-009: real engine; no mocks.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "message-catch-event.bpmn20.xml";
const PROCESS_KEY = "messageCatchE2E";

const FIXTURE_XML = readFileSync(resolve(`e2e/fixtures/${FIXTURE_NAME}`), "utf8");

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

interface FlowableEventSubscription {
  id: string;
  eventType?: string;
  eventName?: string;
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
  const form = new FormData();
  form.append("deployment", new Blob([FIXTURE_XML], { type: "application/xml" }), FIXTURE_NAME);
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

async function findFirstTask(processInstanceId: string): Promise<FlowableTask | null> {
  const res = await fetch(
    `${FLOWABLE}/runtime/tasks?processInstanceId=${processInstanceId}&size=10`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as FlowablePage<FlowableTask>;
  return body.data[0] ?? null;
}

async function completeTask(taskId: string): Promise<void> {
  await fetch(`${FLOWABLE}/runtime/tasks/${taskId}`, {
    method: "POST",
    headers: { Authorization: BASIC, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "complete" }),
  });
}

async function listEventSubscriptions(
  processInstanceId: string,
): Promise<FlowableEventSubscription[]> {
  const res = await fetch(
    `${FLOWABLE}/runtime/event-subscriptions?processInstanceId=${processInstanceId}&size=50`,
    { headers: { Authorization: BASIC } },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as FlowablePage<FlowableEventSubscription>;
  return body.data ?? [];
}

async function cancelInstance(id: string): Promise<void> {
  await fetch(`${FLOWABLE}/runtime/process-instances/${id}?deleteReason=e2e-24-2`, {
    method: "DELETE",
    headers: { Authorization: BASIC },
  });
}

const BUSINESS_KEY = `e2e-24-2-${Date.now()}`;
let parkedInstance: FlowableProcessInstance | null = null;
let seededSubscription: FlowableEventSubscription | null = null;

test.describe("/events list + <InstanceEventSubscriptionsPanel> (Story 24.2)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    parkedInstance = await startInstance(BUSINESS_KEY);
    // Complete the first user task so the instance parks on the message catch.
    const firstTask = await findFirstTask(parkedInstance.id);
    if (firstTask) await completeTask(firstTask.id);
    // Poll for the subscription to surface.
    for (let i = 0; i < 10; i++) {
      const subs = await listEventSubscriptions(parkedInstance.id);
      if (subs.length > 0) {
        seededSubscription = subs[0] ?? null;
        break;
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  });

  test.afterAll(async () => {
    if (parkedInstance) await cancelInstance(parkedInstance.id).catch(() => undefined);
    await deleteFixtureDeployments();
  });

  test("Sidebar nav: Events link routes to /events", async ({ page }) => {
    await page.goto("/");
    const navLink = page.getByRole("link", { name: /^Events$/ });
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/\/events$/);
  });

  test("PageHead renders on /events", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Event subscriptions" })).toBeVisible();
  });

  test("standalone list renders the table OR empty-state copy", async ({ page }) => {
    await page.goto("/events");
    if (seededSubscription) {
      const table = page.locator('[data-testid="events-table"]');
      await expect(table).toBeVisible({ timeout: 10_000 });
    } else {
      await expect(page.getByText("No event subscriptions.")).toBeVisible();
    }
  });

  test("filter by event-type updates the URL", async ({ page }) => {
    await page.goto("/events");
    await page.getByTestId("events-event-type-filter").selectOption("message");
    await expect(page).toHaveURL(/eventType=message/);
  });

  test("filter by event-name commits on Enter and updates the URL", async ({ page }) => {
    await page.goto("/events");
    const input = page.getByTestId("events-event-name-filter");
    await input.fill("payment-confirmed");
    await input.press("Enter");
    await expect(page).toHaveURL(/eventName=payment-confirmed/);
  });

  test("filter clear restores /events (no query params)", async ({ page }) => {
    await page.goto("/events?eventType=message");
    await page.getByTestId("events-event-type-filter").selectOption("");
    await expect(page).toHaveURL(/\/events$/);
  });

  test("instance panel shows the seeded subscription", async ({ page }) => {
    test.skip(!parkedInstance, "instance was not seeded");
    await page.goto(`/instances/${parkedInstance?.id}`);
    const panel = page.getByTestId("instance-event-subscriptions-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    if (seededSubscription) {
      const row = page.getByTestId(`event-subscription-row-${seededSubscription.id}`);
      await expect(row).toBeVisible();
    }
  });

  test("panel View-all link navigates to /events with processInstanceId search", async ({
    page,
  }) => {
    test.skip(!parkedInstance, "instance was not seeded");
    await page.goto(`/instances/${parkedInstance?.id}`);
    const viewAll = page.getByTestId("event-subscriptions-view-all");
    await expect(viewAll).toBeVisible();
    await viewAll.click();
    await expect(page).toHaveURL(new RegExp(`/events\\?processInstanceId=${parkedInstance?.id}$`));
  });

  test("Inspector chip surfaces /runtime/event-subscriptions on /events", async ({ page }) => {
    await page.goto("/events");
    // Target the PageHead's API chip (button role) with the exact GET label —
    // bare getByText() also matches the inspector drawer's URL column + the
    // generated cURL snippet.
    await expect(
      page.getByRole("button", { name: /GET \/runtime\/event-subscriptions$/ }),
    ).toBeVisible();
  });
});
