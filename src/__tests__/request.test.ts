// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the request() funnel in src/api.ts.
 *
 * Per Pattern P-001: every Flowable REST call MUST go through this funnel.
 * Tests assert that:
 *  - the funnel itself behaves correctly (success, 4xx, 5xx, network),
 *  - the api:log CustomEvent fires exactly once per call,
 *  - FlowableError carries the verbatim engine body and HTTP status (P-003).
 *
 * Per Pattern P-009: we mock at the HTTP layer (window.fetch) — never vi.mock(api).
 * If a test wants to assert behavior of api.listX(), it does so by mocking fetch,
 * not by replacing the api module.
 *
 * See: _bmad-output/planning-artifacts/architecture.md#p-001
 *      _bmad-output/planning-artifacts/architecture.md#p-003
 *      _bmad-output/planning-artifacts/architecture.md#p-009
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, type ApiLogEntry, api, FlowableError } from "../api";

let fetchMock: ReturnType<typeof vi.fn>;
let apiLogHandler: ReturnType<typeof vi.fn>;

const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";

beforeEach(() => {
  // Reset module-singleton state.
  API_LOG.length = 0;
  api.setConfig({
    baseUrl: DEFAULT_BASE,
    username: "rest-admin",
    password: "test",
    tenantId: "",
  });

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  apiLogHandler = vi.fn();
  window.addEventListener("api:log", apiLogHandler as EventListener);
});

afterEach(() => {
  window.removeEventListener("api:log", apiLogHandler as EventListener);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface MockResponseOpts {
  status: number;
  body?: string;
  json?: unknown;
  contentType?: string;
}

function mockResponse(opts: MockResponseOpts): Response {
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  else if (opts.json !== undefined) headers.set("content-type", "application/json");

  const bodyText = opts.body ?? (opts.json !== undefined ? JSON.stringify(opts.json) : "");
  return new Response(bodyText, { status: opts.status, headers });
}

describe("request() — success path", () => {
  it("GET 200 with JSON body returns parsed data", async () => {
    const payload = { data: [], total: 0, start: 0, size: 0, sort: "", order: "" };
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: payload }));

    const result = await api.listDeployments();
    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/repository/deployments`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Accept).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("POST with JSON body sends serialized body and Content-Type: application/json", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, json: { id: "dep-1" } }));

    const payload = { businessKey: "ord-42", variables: [{ name: "x", value: 1 }] };
    await api.startProcessInstance(payload);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it("GET with raw: true returns the response body as a string", async () => {
    const xml = '<?xml version="1.0"?><bpmn />';
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: xml, contentType: "application/xml" }),
    );

    const result = await api.getProcessDefinitionResource("def-1");
    expect(result).toBe(xml);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Accept).toBe("*/*");
  });

  it("GET 200 with non-JSON content-type falls back to text()", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: "plain", contentType: "text/plain" }),
    );

    // Use runRaw to avoid the wrappers that pin a specific T.
    const result = await api.runRaw("GET", "/management/engine");
    expect(result).toBe("plain");
  });

  it("GET with params encodes the query string and skips null/undefined/empty", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
      }),
    );

    await api.listDeployments({
      size: 10,
      sort: null,
      order: undefined,
      name: "",
      category: "ops",
    });

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe(`${DEFAULT_BASE}/repository/deployments?size=10&category=ops`);
  });

  it("DMN endpoints rewrite the URL via dmnBase()", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
      }),
    );

    await api.listDecisions();

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("/flowable-rest/dmn-api/");
    expect(url).not.toContain("/flowable-rest/service/");
  });

  it("runRaw routes /dmn-* paths to the DMN sub-app", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { ok: true } }));

    await api.runRaw("GET", "/dmn-repository/decisions");

    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("http://localhost:8080/flowable-rest/dmn-api/dmn-repository/decisions");
  });
});

describe("request() — error paths", () => {
  it("400 with engine body throws FlowableError with status 400 and verbatim message", async () => {
    const before = API_LOG.length;
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: "Tenant id is required" }));

    await expect(api.listDeployments()).rejects.toBeInstanceOf(FlowableError);
    expect(API_LOG.length).toBe(before + 1);
    expect(API_LOG[0]?.status).toBe(400);
    expect(API_LOG[0]?.error).toBe("Tenant id is required");
  });

  it("400 error carries the verbatim message on FlowableError.message", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: "Tenant id is required" }));
    await expect(api.listDeployments()).rejects.toMatchObject({
      status: 400,
      message: "Tenant id is required",
    });
  });

  it("404 with empty body falls back to 'HTTP 404'", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: "" }));

    await expect(api.listDeployments()).rejects.toMatchObject({
      status: 404,
      message: "HTTP 404",
    });
    expect(API_LOG[0]?.error).toBe("HTTP 404");
  });

  it("500 with engine body throws FlowableError with status 500 and the body", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 500, body: "internal error" }));
    await expect(api.listDeployments()).rejects.toMatchObject({
      status: 500,
      message: "internal error",
    });
    expect(API_LOG[0]?.status).toBe(500);
  });

  it("network error (TypeError: fetch failed) propagates with status: 0 in the log", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(api.listDeployments()).rejects.toBeInstanceOf(TypeError);
    expect(API_LOG.length).toBe(1);
    expect(API_LOG[0]?.status).toBe(0);
    expect(API_LOG[0]?.error).toContain("fetch failed");
  });
});

describe("request() — api:log event bus", () => {
  it("success path dispatches one api:log event with the entry detail", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
      }),
    );
    await api.listDeployments();

    expect(apiLogHandler).toHaveBeenCalledTimes(1);
    const ev = apiLogHandler.mock.calls[0]?.[0] as CustomEvent<ApiLogEntry>;
    expect(ev.detail.method).toBe("GET");
    expect(ev.detail.path).toBe("/repository/deployments");
    expect(ev.detail.status).toBe(200);
    expect(ev.detail.url).toBe(`${DEFAULT_BASE}/repository/deployments`);
    expect(typeof ev.detail.ms).toBe("number");
    expect(typeof ev.detail.at).toBe("string");
    // ISO-8601 timestamp shape.
    expect(ev.detail.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("error path dispatches one api:log event carrying the error", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: "bad request" }));
    await expect(api.listDeployments()).rejects.toBeInstanceOf(FlowableError);

    expect(apiLogHandler).toHaveBeenCalledTimes(1);
    const ev = apiLogHandler.mock.calls[0]?.[0] as CustomEvent<ApiLogEntry>;
    expect(ev.detail.status).toBe(400);
    expect(ev.detail.error).toBe("bad request");
  });

  it("entry includes headers with Authorization redacted to 'Basic ***'", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
      }),
    );
    await api.listDeployments();

    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
    expect(API_LOG[0]?.headers?.Accept).toBe("application/json");
  });

  it("entry includes the original opts.body when provided as a JS value", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, json: { id: "pi-1" } }));
    const payload = {
      processDefinitionId: "def-1",
      variables: [{ name: "x", value: 1 }],
    };
    await api.startProcessInstance(payload);

    expect(API_LOG[0]?.body).toEqual(payload);
    // Identity preserved — no defensive JSON.parse(JSON.stringify).
    expect(API_LOG[0]?.body).toBe(payload);
  });

  it("entry leaves body undefined for GET requests", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
      }),
    );
    await api.listDeployments();

    expect(API_LOG[0]?.body).toBeUndefined();
  });

  // AC-4 / Story 8.1: ring buffer cap re-asserted here (do not duplicate).
  it("API_LOG ring buffer caps at 60 entries, newest first", async () => {
    // Response body is single-use, so build a fresh Response per call.
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        mockResponse({
          status: 200,
          json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
        }),
      ),
    );

    for (let i = 0; i < 61; i++) {
      await api.runRaw("GET", `/probe?n=${i}`);
    }

    expect(API_LOG.length).toBe(60);
    // Most recent call (n=60) sits at index 0; oldest preserved (n=1) at index 59.
    expect(API_LOG[0]?.path).toBe("/probe?n=60");
    expect(API_LOG[59]?.path).toBe("/probe?n=1");
  });
});

describe("api.* wrappers smoke (P-001 — every call goes through request())", () => {
  // One-shot mock that always returns 200 OK. Each api.* call funnels through
  // request() / uploadDeployment, so each succeeded call exercises another
  // wrapper line for coverage.
  beforeEach(() => {
    fetchMock.mockImplementation((url: string) => {
      // Multipart deploy endpoints expect a JSON deployment back.
      if (typeof url === "string" && url.endsWith("/repository/deployments")) {
        return Promise.resolve(
          mockResponse({ status: 201, json: { id: "dep-1", name: "x", deploymentTime: "" } }),
        );
      }
      return Promise.resolve(
        mockResponse({
          status: 200,
          json: { data: [], total: 0, start: 0, size: 0, sort: "", order: "" },
        }),
      );
    });
  });

  it("repository: listDeployments / createDeployment / deleteDeployment / listDeploymentResources", async () => {
    await api.listDeployments({ size: 5 });
    await api.createDeployment({ name: "x" });
    await api.deleteDeployment("dep-1", true);
    await api.deleteDeployment("dep-1");
    await api.listDeploymentResources("dep-1");
  });

  it("definitions: list / suspend / activate / resource", async () => {
    await api.listProcessDefinitions({ size: 5 });
    await api.suspendProcessDefinition("def-1", true);
    await api.suspendProcessDefinition("def-1", false);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: "<bpmn/>", contentType: "application/xml" }),
    );
    await api.getProcessDefinitionResource("def-1");
  });

  it("instances: list / start / delete / variables", async () => {
    await api.listProcessInstances({ size: 5 });
    await api.startProcessInstance({ processDefinitionId: "def-1" });
    await api.deleteProcessInstance("pi-1", "cancelled");
    await api.deleteProcessInstance("pi-1");
    await api.getProcessInstanceVariables("pi-1");
  });

  it("tasks: list / action / variables / form", async () => {
    await api.listTasks({ size: 5 });
    await api.taskAction("task-1", "claim", { assignee: "u" });
    await api.taskAction("task-1", "complete");
    await api.getTaskVariables("task-1");
    await api.getTaskForm("task-1");
  });

  it("jobs: list / timer / deadletter / execute / move / stacktrace", async () => {
    await api.listJobs({ size: 5 });
    await api.listTimerJobs({ size: 5 });
    await api.listDeadLetterJobs({ size: 5 });
    await api.executeJob("job-1");
    await api.moveDeadLetterJob("job-1");
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: "stack", contentType: "text/plain" }),
    );
    await api.jobStacktrace("job-1");
  });

  it("history: instances / activities / variables / tasks", async () => {
    await api.listHistoricInstances({ finished: true });
    await api.listHistoricActivities({ processInstanceId: "pi-1" });
    await api.listHistoricVariables({ processInstanceId: "pi-1" });
    await api.listHistoricTasks({ size: 5 });
  });

  it("identity: users / groups / userGroups / addUserToGroup", async () => {
    await api.listUsers({ size: 5 });
    await api.listGroups({ size: 5 });
    await api.getUserGroups("u-1");
    await api.addUserToGroup("u-1", "g-1");
  });

  it("tenants: derives distinct ids from /repository/deployments", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: {
          data: [{ tenantId: "alpha" }, { tenantId: "beta" }, { tenantId: "alpha" }, {}],
          total: 4,
          start: 0,
          size: 1000,
          sort: "",
          order: "",
        },
      }),
    );
    const out = await api.listTenants();
    expect(out.data.map((t) => t.id).sort()).toEqual(["alpha", "beta"]);
  });

  it("DMN: listDecisions / listDmnDeployments / executeDecision / getDmnResource", async () => {
    await api.listDecisions();
    await api.listDmnDeployments();
    await api.executeDecision({ decisionKey: "k", variables: {} });
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: "<dmn/>", contentType: "application/xml" }),
    );
    await api.getDmnResource("dep-1", "res-1");
  });

  it("DMN: listDmnDeploymentResources hits /dmn-repository/deployments/{id}/resources", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        json: [{ id: "loan-eligibility.dmn", url: "x", contentUrl: "y", type: "resource" }],
      }),
    );
    const out = await api.listDmnDeploymentResources("dep-42");
    expect(out[0]?.id).toBe("loan-eligibility.dmn");
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toMatch(/\/dmn-api\/dmn-repository\/deployments\/dep-42\/resources$/);
  });

  it("deployBpmn / deployDmn upload via multipart and log the call", async () => {
    const before = API_LOG.length;
    await api.deployBpmn("loan.bpmn20.xml", "<bpmn/>");
    expect(API_LOG.length).toBe(before + 1);
    expect(API_LOG[0]?.method).toBe("POST");

    await api.deployDmn("loan.dmn", "<dmn/>");
    expect(API_LOG[0]?.method).toBe("POST");
  });

  it("deployBpmn surfaces 4xx engine bodies as FlowableError", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: "bad model" }));
    await expect(api.deployBpmn("bad.bpmn", "<bpmn/>")).rejects.toBeInstanceOf(FlowableError);
    expect(API_LOG[0]?.status).toBe(400);
    expect(API_LOG[0]?.error).toBe("bad model");
  });

  it("deployBpmn surfaces network errors with status: 0 in the log", async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(api.deployBpmn("bad.bpmn", "<bpmn/>")).rejects.toBeInstanceOf(TypeError);
    expect(API_LOG[0]?.status).toBe(0);
    expect(API_LOG[0]?.error).toContain("fetch failed");
  });

  it("ping returns the engine info", async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, json: { name: "flowable", version: "7.2.0" } }),
    );
    const r = await api.ping();
    expect(r.name).toBe("flowable");
    expect(r.version).toBe("7.2.0");
  });
});

describe("request() — NFR-8 credential redaction", () => {
  it("raw Basic-auth credential never appears in API_LOG (success / 4xx / network)", async () => {
    const credential = btoa("rest-admin:test");

    // (a) success
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { ok: true } }));
    await api.runRaw("GET", "/probe-ok");
    expect(JSON.stringify(API_LOG)).not.toContain(credential);
    expect(JSON.stringify(API_LOG)).toContain('"Authorization":"Basic ***"');

    // (b) 4xx
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: "bad" }));
    await expect(api.runRaw("GET", "/probe-bad")).rejects.toBeInstanceOf(FlowableError);
    expect(JSON.stringify(API_LOG)).not.toContain(credential);
    expect(JSON.stringify(API_LOG)).toContain('"Authorization":"Basic ***"');

    // (c) network
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(api.runRaw("GET", "/probe-net")).rejects.toBeInstanceOf(TypeError);
    expect(JSON.stringify(API_LOG)).not.toContain(credential);
    expect(JSON.stringify(API_LOG)).toContain('"Authorization":"Basic ***"');
  });

  it("redaction survives setConfig() with new credentials", async () => {
    api.setConfig({
      baseUrl: DEFAULT_BASE,
      username: "alice",
      password: "s3cret!",
      tenantId: "",
    });
    // Defensive: setConfig does not log, but reset to keep AT-the-test indices unambiguous.
    API_LOG.length = 0;

    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { ok: true } }));
    await api.runRaw("GET", "/probe");

    const newCredential = btoa("alice:s3cret!");
    expect(JSON.stringify(API_LOG)).not.toContain(newCredential);
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
    // The username itself MAY appear in url/path/body if the caller intentionally
    // puts it there — only the *header* value is in scope for redaction.
  });

  it("uploadDeployment() entries also redact Authorization (success + failure)", async () => {
    const credential = btoa("rest-admin:test");

    // success
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 201, json: { id: "dep-1", name: "x", deploymentTime: "" } }),
    );
    await api.deployBpmn("x.bpmn", "<bpmn/>");
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
    expect(API_LOG[0]?.headers?.["Content-Type"]).toBeUndefined();
    expect(JSON.stringify(API_LOG)).not.toContain(credential);

    // failure (4xx body propagates verbatim into entry.error; no header leak)
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: "bad model" }));
    await expect(api.deployBpmn("bad.bpmn", "<bpmn/>")).rejects.toBeInstanceOf(FlowableError);
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
    expect(JSON.stringify(API_LOG)).not.toContain(credential);

    // network failure (status: 0 in log)
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(api.deployBpmn("bad.bpmn", "<bpmn/>")).rejects.toBeInstanceOf(TypeError);
    expect(API_LOG[0]?.status).toBe(0);
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
  });

  it("redactor preserves the auth scheme prefix (forward-compat with Bearer)", async () => {
    // Branch-coverage helper: the redactor must split on the first space and
    // preserve the scheme. Today only Basic is sent, so we exercise the helper
    // via a successful Basic call and assert the prefix is preserved.
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { ok: true } }));
    await api.runRaw("GET", "/probe");

    const auth = API_LOG[0]?.headers?.Authorization ?? "";
    expect(auth.startsWith("Basic ")).toBe(true);
    expect(auth.endsWith(" ***")).toBe(true);
    expect(auth).not.toContain(btoa("rest-admin:test"));
  });
});

describe("request() — config + auth", () => {
  it("applies tenantId-less default auth header (Basic of admin:test)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: {} }));
    await api.runRaw("GET", "/probe");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const expected = `Basic ${btoa("rest-admin:test")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expected);
  });

  it("setConfig updates baseUrl and auth on subsequent calls", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: {} }));
    api.setConfig({
      baseUrl: "http://example.test/api/",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await api.runRaw("GET", "/probe");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // Trailing slash stripped from base.
    expect(url).toBe("http://example.test/api/probe");
    const expected = `Basic ${btoa("u:p")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expected);
  });
});

describe("request() — asResponse option (Story 9.6 AC-1a)", () => {
  it("returns the raw Response object when asResponse is true", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("xml bytes", { status: 200, headers: { "content-type": "application/xml" } }),
    );
    const res = await api.getDeploymentResource("dep-1", "x.bpmn");
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toBe("xml bytes");
  });

  it("still logs to API_LOG when asResponse is true", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await api.getDeploymentResource("dep-1", "x.bpmn");
    expect(API_LOG[0]?.status).toBe(200);
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
    expect(API_LOG[0]?.body).toBeUndefined();
  });

  it("throws FlowableError on 4xx with asResponse", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not found", { status: 404 }));
    await expect(api.getDeploymentResource("dep-x", "missing.bpmn")).rejects.toBeInstanceOf(
      FlowableError,
    );
    expect(API_LOG[0]?.status).toBe(404);
  });

  it("encodes the resource name in the URL path", async () => {
    fetchMock.mockResolvedValueOnce(new Response("ok", { status: 200 }));
    await api.getDeploymentResource("dep-1", "file with spaces.bpmn");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("file%20with%20spaces.bpmn");
  });
});

describe("uploadDeployment() — sync-throw pre-network (Story 9.2 AC-7)", () => {
  /**
   * Closes the Story 8.1 deferred-work entry. The multipart-setup block
   * (FormData + Blob + redactAuthHeader) now lives INSIDE the `try`, so a
   * Blob constructor throw lands an API_LOG entry with status=0 instead of
   * silently stranding the event.
   */
  it("Blob constructor throw still lands an API_LOG entry with status=0", async () => {
    const RealBlob = globalThis.Blob;
    const blobSpy = vi.spyOn(globalThis, "Blob").mockImplementation(() => {
      throw new Error("Blob constructor failed");
    });
    try {
      await expect(api.deployBpmn("x.bpmn", "<bpmn/>")).rejects.toThrow("Blob constructor failed");
      expect(API_LOG[0]).toBeDefined();
      expect(API_LOG[0]?.error).toBe("Blob constructor failed");
      expect(API_LOG[0]?.status).toBe(0);
      // The throw fires before headers are set; entry.headers undefined is
      // leak-free by construction (NFR-8 only mandates "never leak").
      expect(API_LOG[0]?.headers).toBeUndefined();
    } finally {
      blobSpy.mockRestore();
      // Defensive — vi.restoreAllMocks() in afterEach handles this too.
      globalThis.Blob = RealBlob;
    }
  });
});
