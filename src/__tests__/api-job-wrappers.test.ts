// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the management-job wrappers in src/api.ts.
 *
 * Pins the verbatim wire shape so a future refactor can't silently change
 * the URL or body. Each test asserts:
 *  - HTTP method
 *  - URL (including job-type namespace prefix — executable / timer /
 *    deadletter live at distinct paths in Flowable 7.x)
 *  - Request body where applicable
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

describe("api.executeJob", () => {
  it("POSTs {action: 'execute'} to /management/jobs/{id}", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: "" }));
    await api.executeJob("job-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/jobs/job-1`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ action: "execute" }));
  });
});

describe("api.executeTimerJob", () => {
  it("POSTs {action: 'move'} to /management/timer-jobs/{id} (Flowable 7.x verb for fire-now)", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, body: "" }));
    await api.executeTimerJob("timer-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/timer-jobs/timer-1`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ action: "move" }));
  });
});

describe("api.rescheduleTimerJob", () => {
  it("POSTs {action: 'reschedule', dueDate} to /management/timer-jobs/{id}", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ id: "timer-1", retries: 3 }),
        contentType: "application/json",
      }),
    );
    const due = "2050-01-01T00:00:00.000Z";
    await api.rescheduleTimerJob("timer-1", due);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/timer-jobs/timer-1`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ action: "reschedule", dueDate: due }));
  });
});

describe("api.moveDeadLetterJob", () => {
  it("POSTs {action: 'move'} to /management/deadletter-jobs/{id}", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ id: "dead-1", retries: 0 }),
        contentType: "application/json",
      }),
    );
    await api.moveDeadLetterJob("dead-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/deadletter-jobs/dead-1`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ action: "move" }));
  });
});

describe("stacktrace wrappers route to distinct namespaces", () => {
  it("api.jobStacktrace → /management/jobs/{id}/exception-stacktrace (raw text)", async () => {
    const text = "java.lang.RuntimeException: boom\n\tat com.example...";
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: text, contentType: "text/plain" }),
    );
    const out = await api.jobStacktrace("job-1");
    expect(out).toBe(text);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/management/jobs/job-1/exception-stacktrace`);
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Accept).toBe("*/*");
  });

  it("api.timerJobStacktrace → /management/timer-jobs/{id}/exception-stacktrace", async () => {
    const text = "timer-side stack";
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: text, contentType: "text/plain" }),
    );
    const out = await api.timerJobStacktrace("timer-1");
    expect(out).toBe(text);
    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toBe(`${DEFAULT_BASE}/management/timer-jobs/timer-1/exception-stacktrace`);
  });

  it("api.deadLetterJobStacktrace → /management/deadletter-jobs/{id}/exception-stacktrace", async () => {
    const text = "dead-letter stack";
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: text, contentType: "text/plain" }),
    );
    const out = await api.deadLetterJobStacktrace("dead-1");
    expect(out).toBe(text);
    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toBe(`${DEFAULT_BASE}/management/deadletter-jobs/dead-1/exception-stacktrace`);
  });
});
