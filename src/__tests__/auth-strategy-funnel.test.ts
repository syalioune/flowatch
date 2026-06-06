// SPDX-License-Identifier: Apache-2.0

/**
 * Funnel-seam suite for the Story 28.1 AuthStrategy refactor.
 *
 * Asserts that request() + multipartFetch() delegate the Authorization header
 * to the active strategy (set via api.setAuthStrategy) instead of the
 * pre-refactor synchronous basicAuth(). The pre-existing request.test.ts
 * stays the regression gate for Basic byte-identity; this file exercises the
 * swap point, the null-header omission, and the 401 onUnauthorized hook.
 *
 * Per Pattern P-009: mock at the HTTP layer (window.fetch) — never vi.mock(api).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api, FlowableError } from "../api";
import type { AuthStrategy } from "../lib/auth-strategy";
import { BasicAuthStrategy } from "../lib/auth-strategy";

let fetchMock: ReturnType<typeof vi.fn>;
const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";

const okJson = () =>
  new Response(JSON.stringify({ data: [], total: 0 }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  API_LOG.length = 0;
  api.setConfig({ baseUrl: DEFAULT_BASE, username: "rest-admin", password: "test", tenantId: "" });
  // Restore the default strategy between tests (api is a module singleton).
  api.setAuthStrategy(
    new BasicAuthStrategy(() => {
      const c = api.config();
      return { username: c.username, password: c.password };
    }),
  );
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Reset to default so a leaked spy strategy can't poison later suites.
  api.setAuthStrategy(
    new BasicAuthStrategy(() => {
      const c = api.config();
      return { username: c.username, password: c.password };
    }),
  );
});

describe("Story 28.1: default strategy is Basic + byte-identical header", () => {
  it("request() sends Authorization: Basic <base64> via the default strategy", async () => {
    fetchMock.mockResolvedValueOnce(okJson());
    await api.runRaw("GET", "/probe");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("rest-admin:test")}`,
    );
  });

  it("getAuthStrategy() returns the active strategy with kind 'basic'", () => {
    expect(api.getAuthStrategy().kind).toBe("basic");
  });

  it("setConfig() new creds reflect in the header WITHOUT re-installing the strategy", async () => {
    const installed = api.getAuthStrategy();
    api.setConfig({ username: "alice", password: "s3cret" });
    fetchMock.mockResolvedValueOnce(okJson());
    await api.runRaw("GET", "/probe");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("alice:s3cret")}`,
    );
    // Same strategy object — the getter closure re-read cfg, no re-install.
    expect(api.getAuthStrategy()).toBe(installed);
  });
});

describe("Story 28.1: setAuthStrategy swap point", () => {
  it("request() requests the header from the installed spy strategy", async () => {
    const spy: AuthStrategy = {
      kind: "bearer",
      authorizationHeader: vi.fn(async () => "Bearer tok-123"),
    };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(okJson());
    await api.runRaw("GET", "/probe");
    expect(spy.authorizationHeader).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("a null header → NO Authorization header on the request", async () => {
    const spy: AuthStrategy = { kind: "bearer", authorizationHeader: vi.fn(async () => null) };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(okJson());
    await api.runRaw("GET", "/probe");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    // The captured log entry likewise carries no Authorization.
    expect(API_LOG[0]?.headers?.Authorization).toBeUndefined();
  });

  it("a Bearer header redacts scheme-preservingly to 'Bearer ***' in API_LOG", async () => {
    const spy: AuthStrategy = {
      kind: "bearer",
      authorizationHeader: vi.fn(async () => "Bearer secret-jwt"),
    };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(okJson());
    await api.runRaw("GET", "/probe");
    expect(API_LOG[0]?.headers?.Authorization).toBe("Bearer ***");
    expect(JSON.stringify(API_LOG)).not.toContain("secret-jwt");
  });
});

describe("Story 28.1: multipartFetch delegates to the active strategy", () => {
  it("deployBpmn requests the header from the installed spy strategy", async () => {
    const spy: AuthStrategy = {
      kind: "bearer",
      authorizationHeader: vi.fn(async () => "Bearer up-tok"),
    };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "dep-1", name: "x", deploymentTime: "" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    await api.deployBpmn("x.bpmn", "<bpmn/>");
    expect(spy.authorizationHeader).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer up-tok");
    expect(API_LOG[0]?.headers?.Authorization).toBe("Bearer ***");
  });

  it("a null header → multipart upload carries NO Authorization header", async () => {
    const spy: AuthStrategy = { kind: "bearer", authorizationHeader: vi.fn(async () => null) };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "dep-1", name: "x", deploymentTime: "" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    await api.deployBpmn("x.bpmn", "<bpmn/>");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe("Story 28.1: 401 onUnauthorized hook (additive to the error)", () => {
  it("401 → strategy.onUnauthorized awaited once AND the request still rejects", async () => {
    const onUnauthorized = vi.fn(async () => {});
    const spy: AuthStrategy = {
      kind: "bearer",
      authorizationHeader: vi.fn(async () => "Bearer tok"),
      onUnauthorized,
    };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await expect(api.runRaw("GET", "/probe")).rejects.toBeInstanceOf(FlowableError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(API_LOG[0]?.status).toBe(401);
  });

  it("401 with the default Basic strategy (undefined hook) is a no-op + still rejects", async () => {
    fetchMock.mockResolvedValueOnce(new Response("unauthorized", { status: 401 }));
    await expect(api.runRaw("GET", "/probe")).rejects.toMatchObject({ status: 401 });
  });

  it("non-401 errors do NOT call onUnauthorized", async () => {
    const onUnauthorized = vi.fn(async () => {});
    const spy: AuthStrategy = {
      kind: "bearer",
      authorizationHeader: vi.fn(async () => "Bearer tok"),
      onUnauthorized,
    };
    api.setAuthStrategy(spy);
    fetchMock.mockResolvedValueOnce(new Response("bad", { status: 400 }));
    await expect(api.runRaw("GET", "/probe")).rejects.toBeInstanceOf(FlowableError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
