/**
 * E2E — task form rendered by @bpmn-io/form-js-viewer (Story 29.1, FR-23).
 *
 * COMPAT REALITY (docs/compat.md): the default `flowable-rest:7.2.0`
 * `/form/form-data` endpoint returns the LEGACY `formProperties` shape — there
 * is NO REST path on the default image that returns a form-js `components`
 * array (`/form-api/*` is 404). So the form-js render branch CANNOT fire
 * against the live engine; it is fixture-verified by design (Story 29.1 AC-7
 * Probe 2). This spec injects a committed form-js JSON fixture by intercepting
 * the `/form/form-data` GET (the sanctioned "dev-only injection"), then asserts
 * the form-js branch renders and that submit maps the form-js `data` to the
 * SAME `{ properties: [{ id, value }] }` envelope the legacy branch sends —
 * captured by intercepting the `/form/form-data` POST.
 *
 * The task itself is real (seeded via the live engine, mirroring
 * task-form-submit.spec.ts) so /tasks/:id loads a genuine task; only the form
 * payload + submit are intercepted.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const FLOWABLE = "http://localhost:8080/flowable-rest/service";
const BASIC = `Basic ${Buffer.from("rest-admin:test").toString("base64")}`;
const FIXTURE_NAME = "loan-with-form.bpmn20.xml";
const PROCESS_KEY = "loanWithForm";

const FORM_JS_SCHEMA = JSON.parse(
  readFileSync(resolve("e2e/fixtures/loan-form-js.json"), "utf8"),
) as Record<string, unknown>;

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

async function findTaskForInstance(instanceId: string): Promise<FlowableTask | null> {
  const res = await fetch(`${FLOWABLE}/runtime/tasks?processInstanceId=${instanceId}&size=10`, {
    headers: { Authorization: BASIC },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as FlowablePage<FlowableTask>;
  return body.data[0] ?? null;
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

const BUSINESS_KEY = `e2e-29-1-${Date.now()}`;
let startedInstance: FlowableProcessInstance | null = null;

test.describe("/tasks/$id form-js render (Story 29.1)", () => {
  test.beforeAll(async () => {
    await deleteFixtureDeployments();
    await uploadFixture();
    startedInstance = await startInstance(BUSINESS_KEY);
  });

  test.afterAll(async () => {
    if (startedInstance) await cancelInstance(startedInstance.id);
    await deleteFixtureDeployments();
  });

  test("form-js viewer renders the injected schema and submit maps to the { properties } envelope", async ({
    page,
  }) => {
    expect(startedInstance).not.toBeNull();
    const task = await findTaskForInstance(startedInstance?.id ?? "");
    expect(task).not.toBeNull();
    const taskId = task?.id;
    expect(taskId).toBeTruthy();

    // Inject the form-js payload on GET; capture the mapped envelope on POST.
    let postedBody: { taskId?: string; properties?: Array<{ id: string; value: string }> } | null =
      null;
    await page.route("**/flowable-rest/service/form/form-data**", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        postedBody = JSON.parse(req.postData() ?? "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
        return;
      }
      // GET → return the committed form-js schema (carries `components`).
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FORM_JS_SCHEMA),
      });
    });

    await page.goto(`/tasks/${taskId}`);

    // form-js branch renders (NOT the legacy field rows).
    await expect(page.getByTestId("task-form-js-viewer")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("task-form-js-submit")).toBeVisible();
    // The legacy Complete button is hidden when a form is present (AC-9 still
    // holds for the form-js shape via the classifyTaskForm gate).
    await expect(page.getByRole("button", { name: "Complete", exact: true })).toHaveCount(0);

    // Fill the form-js-rendered text input (real form-js render in-browser).
    const comment = page.locator(".form-js-host input[type='text']").first();
    await comment.fill("Approved via form-js");

    // Submit → form.submit() emits the mapped envelope through api.submitTaskForm.
    await page.getByTestId("task-form-js-submit").click();

    // The intercepted POST carries the mapped { properties } envelope.
    await expect.poll(() => postedBody).not.toBeNull();
    const body = postedBody as {
      taskId?: string;
      properties?: Array<{ id: string; value: string }>;
    } | null;
    expect(body?.taskId).toBe(taskId);
    const commentProp = body?.properties?.find((p) => p.id === "comment");
    expect(commentProp?.value).toBe("Approved via form-js");
  });
});
