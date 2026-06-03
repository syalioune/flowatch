// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for Story 25.1 App-definition wrappers + the .bar binary
 * upload path in src/api.ts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api } from "../api";

const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";
const APP_BASE = "http://localhost:8080/flowable-rest/app-api";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  API_LOG.length = 0;
  api.setConfig({
    baseUrl: DEFAULT_BASE,
    username: "rest-admin",
    password: "test",
    tenantId: "",
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("api.listAppDefinitions (Story 25.1)", () => {
  it("GETs /app-repository/app-definitions rewriting /service → /app-api", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
    await api.listAppDefinitions();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_BASE}/app-repository/app-definitions`);
    expect(init.method).toBe("GET");
  });

  it("forwards deploymentId, key, tenantId, latest, size as query params", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
    await api.listAppDefinitions({
      deploymentId: "dep-1",
      key: "loan-app",
      tenantId: "t-1",
      latest: true,
      size: 50,
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("deploymentId=dep-1");
    expect(url).toContain("key=loan-app");
    expect(url).toContain("tenantId=t-1");
    expect(url).toContain("latest=true");
    expect(url).toContain("size=50");
  });
});

describe("api.listAppDeployments (Story 25.1)", () => {
  it("GETs /app-repository/deployments via appBase()", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
    await api.listAppDeployments();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_BASE}/app-repository/deployments`);
    expect(init.method).toBe("GET");
  });

  it("forwards query params", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));
    await api.listAppDeployments({ tenantId: "t-1", size: 25 });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("tenantId=t-1");
    expect(url).toContain("size=25");
  });
});

describe("api.getAppDefinition (Story 25.1)", () => {
  it("GETs /app-repository/app-definitions/{id} via appBase()", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "ad-1", key: "loan-app" }));
    await api.getAppDefinition("ad-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_BASE}/app-repository/app-definitions/ad-1`);
    expect(init.method).toBe("GET");
  });
});

describe("api.listAppDeploymentResources (Story 25.1)", () => {
  it("GETs /app-repository/deployments/{id}/resources via appBase()", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await api.listAppDeploymentResources("dep-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_BASE}/app-repository/deployments/dep-1/resources`);
    expect(init.method).toBe("GET");
  });
});

describe("api.getAppDeploymentResource (Story 25.1)", () => {
  it("GETs resourcedata as raw Response, url-encoding the resource name", async () => {
    const raw = jsonResponse({ ok: true });
    fetchMock.mockResolvedValueOnce(raw);
    const res = await api.getAppDeploymentResource("dep-1", "loan app.app");
    expect(res).toBe(raw);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_BASE}/app-repository/deployments/dep-1/resourcedata/loan%20app.app`);
    expect(init.method).toBe("GET");
  });
});

describe("api.submitTaskForm (Story 11.3)", () => {
  it("POSTs /form/form-data with { taskId, properties } body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));
    await api.submitTaskForm("task-1", {
      properties: [{ id: "amount", value: "100" }],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/form/form-data`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      taskId: "task-1",
      properties: [{ id: "amount", value: "100" }],
    });
  });
});

describe("api.deployBar (Story 25.1)", () => {
  it("POSTs /app-repository/deployments via appBase() with the binary File attached", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "dep-bar-1", name: "loan-app.bar" }));
    const archive = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // ZIP magic
    const file = new File([archive], "loan-app.bar", { type: "application/zip" });
    await api.deployBar("loan-app.bar", file);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${APP_BASE}/app-repository/deployments`);
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    const attached = fd.get("file") as File;
    expect(attached).not.toBeNull();
    expect(attached.type).toBe("application/zip");
    // Bytes round-trip — proves the binary archive content is preserved (not
    // mangled by a `new Blob([file])` text-coercion path).
    expect(attached.size).toBe(archive.length);
    expect(fd.get("deploymentName")).toBe("loan-app.bar");
  });

  it("posts a Blob (non-File) through the passthrough branch without re-wrap", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "dep-bar-2", name: "x.zip" }));
    const blob = new Blob([new Uint8Array([0x50, 0x4b])], { type: "application/zip" });
    await api.deployBar("x.zip", blob);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const fd = init.body as FormData;
    const attached = fd.get("file");
    expect((attached as Blob).type).toBe("application/zip");
  });

  it("forwards a non-empty tenantId from cfg into the multipart body", async () => {
    api.setConfig({ tenantId: "t-9" });
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "dep-bar-3" }));
    const f = new File([new Uint8Array([0x50, 0x4b])], "a.bar", { type: "application/zip" });
    await api.deployBar("a.bar", f);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as FormData).get("tenantId")).toBe("t-9");
  });
});

describe("api.deployDmn widened to accept Blob (Story 25.1)", () => {
  it("POSTs /dmn-repository/deployments with a Blob (extracted from .bar)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "dmn-dep-1", name: "loan.dmn" }));
    const dmnBlob = new Blob(["<definitions/>"], { type: "application/xml" });
    await api.deployDmn("loan.dmn", dmnBlob);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/dmn-api/dmn-repository/deployments");
    expect(init.method).toBe("POST");
    const fd = init.body as FormData;
    expect(fd.get("deploymentName")).toBe("loan.dmn");
  });
});

describe("uploadDeployment widened signature (Story 25.1)", () => {
  it("string content path is unchanged — api.deployBpmn still works", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "dep-bpmn-1", name: "orders.bpmn" }));
    await api.deployBpmn("orders.bpmn", "<bpmn/>");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/repository/deployments`);
    expect(init.method).toBe("POST");
    const fd = init.body as FormData;
    const attached = fd.get("file") as Blob;
    expect(attached).toBeInstanceOf(Blob);
    expect(attached.type).toBe("application/xml");
  });
});
