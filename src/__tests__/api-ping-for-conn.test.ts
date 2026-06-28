// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for `api.pingForConn` (Story 34.1 review patch — P1).
 *
 * Asserts:
 *  1. Routes GET /management/engine through the request() funnel (not raw fetch).
 *  2. Targets `effectiveBase = baseUrl + servicePath` when both are set and
 *     baseUrl does NOT already end with servicePath.
 *  3. Falls back to bare baseUrl when servicePath is absent.
 *  4. Skips servicePath when baseUrl already ends with it (backward-compat).
 *  5. Uses BasicAuth with the connection's username/password (not the global cfg).
 *  6. Restores the previous authStrategy after the call (even on failure).
 *  7. The call appears in API_LOG (funnel proof — NFR-8 redaction smoke-check).
 *
 * Per Pattern P-009: mocks live at window.fetch — never on the api module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api } from "../api";

const GLOBAL_BASE = "http://localhost:8080/flowable-rest/service";

let fetchMock: ReturnType<typeof vi.fn>;

function mockEngineInfo(name = "Flowable", version = "7.2.0"): Response {
  return new Response(JSON.stringify({ name, version }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  API_LOG.length = 0;
  api.setConfig({
    baseUrl: GLOBAL_BASE,
    username: "rest-admin",
    // gitguardian:ignore - test fixture, not a real secret
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

describe("api.pingForConn", () => {
  it("GETs /management/engine at baseUrl when servicePath is absent", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.pingForConn({
      baseUrl: "http://staging:8080/flowable-rest/service",
      username: "admin",
      // gitguardian:ignore - test fixture, not a real secret
      password: "secret",
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://staging:8080/flowable-rest/service/management/engine");
  });

  it("appends servicePath to baseUrl when baseUrl does not already end with it", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.pingForConn({
      baseUrl: "http://staging:8080",
      servicePath: "/flowable-rest/service",
      username: "admin",
      // gitguardian:ignore - test fixture, not a real secret
      password: "secret",
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://staging:8080/flowable-rest/service/management/engine");
  });

  it("does NOT double-append servicePath when baseUrl already ends with it", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.pingForConn({
      baseUrl: "http://staging:8080/flowable-rest/service",
      servicePath: "/flowable-rest/service",
      username: "admin",
      // gitguardian:ignore - test fixture, not a real secret
      password: "secret",
    });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://staging:8080/flowable-rest/service/management/engine");
  });

  it("uses the connection's credentials, not the global cfg credentials", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.pingForConn({
      baseUrl: "http://staging:8080/flowable-rest/service",
      username: "conn-user",
      // gitguardian:ignore - test fixture, not a real secret
      password: "conn-pass",
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const authHeader = (init.headers as Record<string, string>).Authorization;
    // Basic base64("conn-user:conn-pass")
    expect(authHeader).toBe(`Basic ${btoa("conn-user:conn-pass")}`);
  });

  it("global cfg credentials are unchanged after the call", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.pingForConn({
      baseUrl: "http://staging:8080/flowable-rest/service",
      username: "conn-user",
      // gitguardian:ignore - test fixture, not a real secret
      password: "conn-pass",
    });
    // The global strategy is the one that uses rest-admin/test; verify by
    // doing a second call with the restored global strategy and inspecting.
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.ping();
    const [, init2] = fetchMock.mock.calls[1] as [string, RequestInit];
    const authHeader2 = (init2.headers as Record<string, string>).Authorization;
    expect(authHeader2).toBe(`Basic ${btoa("rest-admin:test")}`);
  });

  it("restores the previous authStrategy even when the request throws", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      api.pingForConn({
        baseUrl: "http://unreachable:9999/flowable-rest/service",
        username: "u",
        // gitguardian:ignore - test fixture, not a real secret
        password: "p",
      }),
    ).rejects.toThrow();
    // Global strategy still uses rest-admin/test.
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.ping();
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const authHeader = (init.headers as Record<string, string>).Authorization;
    expect(authHeader).toBe(`Basic ${btoa("rest-admin:test")}`);
  });

  it("logs the call to API_LOG (routes through the request() funnel)", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo());
    await api.pingForConn({
      baseUrl: "http://staging:8080/flowable-rest/service",
      username: "u",
      // gitguardian:ignore - test fixture, not a real secret
      password: "p",
    });
    expect(API_LOG.length).toBe(1);
    if (!API_LOG[0]) throw new Error("API_LOG[0] missing");
    const entry = API_LOG[0];
    expect(entry.path).toBe("/management/engine");
    expect(entry.status).toBe(200);
    // NFR-8: Authorization header in the log must be redacted.
    expect(entry.headers?.Authorization).toBe("Basic ***");
  });

  it("returns the engine info on success", async () => {
    fetchMock.mockResolvedValueOnce(mockEngineInfo("Flowable", "7.2.0"));
    const result = await api.pingForConn({
      baseUrl: "http://staging:8080/flowable-rest/service",
      username: "u",
      // gitguardian:ignore - test fixture, not a real secret
      password: "p",
    });
    expect(result.name).toBe("Flowable");
    expect(result.version).toBe("7.2.0");
  });
});
