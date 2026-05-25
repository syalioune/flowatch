// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the history wrappers in src/api.ts.
 *
 * Pins the verbatim wire shape so a future refactor can't silently change
 * the URL or query params.
 *
 * Per Pattern P-009: mocks live at window.fetch — never on the api module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api } from "../api";

const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";

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

function mockResponse(opts: { status: number; body?: string; contentType?: string }): Response {
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  return new Response(opts.body ?? "", { status: opts.status, headers });
}

describe("api.getHistoricProcessInstance", () => {
  it("GETs /history/historic-process-instances/{id} with no body or params (Story 13.1 AC-2)", async () => {
    const id = "pi-42";
    const payload = JSON.stringify({
      id,
      processDefinitionId: "loanApproval:1:abc",
      processDefinitionKey: "loanApproval",
      startTime: "2026-05-25T10:00:00.000Z",
      endTime: "2026-05-25T10:05:00.000Z",
      durationInMillis: 300_000,
    });
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: payload, contentType: "application/json" }),
    );
    const out = await api.getHistoricProcessInstance(id);
    expect(out.id).toBe(id);
    expect(out.durationInMillis).toBe(300_000);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/history/historic-process-instances/${id}`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("propagates a 404 as FlowableError so callers can apply the status-aware probe", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 404, body: "not found", contentType: "text/plain" }),
    );
    await expect(api.getHistoricProcessInstance("nope")).rejects.toMatchObject({
      status: 404,
    });
  });
});
