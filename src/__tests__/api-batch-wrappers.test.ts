// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the batch wrappers in src/api.ts (Story 24.1 FR-53).
 *
 * Pins the verbatim wire shape of `listBatches` / `getBatch` /
 * `listBatchParts` / `batchPartStacktrace` so future refactors can't
 * silently change the URL.
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

describe("api.listBatches", () => {
  it("GETs /management/batches with size=50", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [] }),
        contentType: "application/json",
      }),
    );
    await api.listBatches({ size: 50 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/batches?size=50`);
    expect(init.method).toBe("GET");
  });
});

describe("api.getBatch", () => {
  it("GETs /management/batches/{id}", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ id: "b-1" }),
        contentType: "application/json",
      }),
    );
    await api.getBatch("b-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/batches/b-1`);
    expect(init.method).toBe("GET");
  });
});

describe("api.listBatchParts", () => {
  it("GETs /management/batches/{id}/batch-parts with the query params", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [] }),
        contentType: "application/json",
      }),
    );
    await api.listBatchParts("b-1", { size: 100 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/batches/b-1/batch-parts?size=100`);
    expect(init.method).toBe("GET");
  });
});

describe("api.batchPartStacktrace", () => {
  it("GETs /management/batch-parts/{id}/exception-stacktrace as text/plain", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: "java.lang.RuntimeException: boom",
        contentType: "text/plain",
      }),
    );
    const stack = await api.batchPartStacktrace("part-fail");
    expect(stack).toBe("java.lang.RuntimeException: boom");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/batch-parts/part-fail/exception-stacktrace`);
    expect(init.method).toBe("GET");
  });

  it("throws FlowableError with status=404 when part has no stacktrace", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 404, body: "Not found", contentType: "text/plain" }),
    );
    await expect(api.batchPartStacktrace("part-ok")).rejects.toMatchObject({ status: 404 });
  });
});
