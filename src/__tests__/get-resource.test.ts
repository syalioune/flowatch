/**
 * Vitest unit tests for the single-resource GETs added in Story 3.3:
 *   - api.getDeployment(id)         → GET /repository/deployments/{id}
 *   - api.getProcessDefinition(id)  → GET /repository/process-definitions/{id}
 *
 * Both go through request() per Pattern P-001; the tests mock window.fetch
 * (the HTTP boundary) per Pattern P-009.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api, FlowableError } from "../api";

let fetchMock: ReturnType<typeof vi.fn>;

const BASE = "http://localhost:8080/flowable-rest/service";

beforeEach(() => {
  API_LOG.length = 0;
  api.setConfig({ baseUrl: BASE, username: "rest-admin", password: "test", tenantId: "" });

  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockResponse(opts: { status: number; json?: unknown; body?: string }): Response {
  const headers = new Headers();
  if (opts.json !== undefined) headers.set("content-type", "application/json");
  const bodyText = opts.body ?? (opts.json !== undefined ? JSON.stringify(opts.json) : "");
  return new Response(bodyText, { status: opts.status, headers });
}

describe("api.getDeployment", () => {
  it("issues GET /repository/deployments/{id} and returns the parsed body", async () => {
    const payload = {
      id: "dep-1",
      name: "loan-approval",
      deploymentTime: "2026-05-15T12:00:00.000Z",
      tenantId: "",
    };
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: payload }));

    const result = await api.getDeployment("dep-1");
    expect(result).toEqual(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/repository/deployments/dep-1`);
    expect(init.method).toBe("GET");
  });

  it("propagates a 404 as FlowableError with the verbatim engine body", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        mockResponse({
          status: 404,
          body: "Could not find a deployment with id 'missing'.",
        }),
      ),
    );
    await expect(api.getDeployment("missing")).rejects.toBeInstanceOf(FlowableError);
    await expect(api.getDeployment("missing")).rejects.toMatchObject({
      status: 404,
      message: "Could not find a deployment with id 'missing'.",
    });
  });
});

describe("api.getProcessDefinition", () => {
  it("issues GET /repository/process-definitions/{id}", async () => {
    const payload = {
      id: "loan:1:abc",
      key: "loan",
      name: "Loan Approval",
      version: 1,
      deploymentId: "dep-1",
    };
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: payload }));

    const result = await api.getProcessDefinition("loan:1:abc");
    expect(result).toEqual(payload);

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/repository/process-definitions/loan:1:abc`);
  });
});
