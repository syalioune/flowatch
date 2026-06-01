// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the event-subscription wrapper in src/api.ts (Story
 * 24.2 FR-54). Pins the wire shape.
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

describe("api.listEventSubscriptions", () => {
  it("GETs /runtime/event-subscriptions with no filters", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [] }),
        contentType: "application/json",
      }),
    );
    await api.listEventSubscriptions();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/runtime/event-subscriptions`);
    expect(init.method).toBe("GET");
  });

  it("forwards processInstanceId, eventType, eventName, tenantId, size as query params", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [] }),
        contentType: "application/json",
      }),
    );
    await api.listEventSubscriptions({
      processInstanceId: "pi-1",
      eventType: "message",
      eventName: "payment-confirmed",
      tenantId: "t-1",
      size: 50,
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("processInstanceId=pi-1");
    expect(url).toContain("eventType=message");
    expect(url).toContain("eventName=payment-confirmed");
    expect(url).toContain("tenantId=t-1");
    expect(url).toContain("size=50");
  });
});
