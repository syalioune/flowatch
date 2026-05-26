// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the DMN wrappers under `src/api.ts`.
 *
 * Asserts that `api.removeDmnDeployment` routes through `request()` to
 * `DELETE /dmn-repository/deployments/{id}` against `dmnBase()` (not
 * `/service/...`). Mocks `fetch` so the test is hermetic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

interface CapturedFetch {
  url: string;
  method: string;
}

describe("api.removeDmnDeployment", () => {
  let originalFetch: typeof globalThis.fetch;
  let calls: CapturedFetch[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, method: init?.method ?? "GET" });
      // Use 200 with an empty text body — 204 cannot carry a body and the
      // request() funnel falls back to text() when content-type is not JSON.
      return new Response("", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("issues DELETE against /dmn-api/dmn-repository/deployments/{id}", async () => {
    await api.removeDmnDeployment("dep-123");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("DELETE");
    expect(calls[0]?.url).toMatch(/\/dmn-api\/dmn-repository\/deployments\/dep-123$/);
    // Critically, NOT under /service/ — the dmnBase() helper is honored.
    expect(calls[0]?.url).not.toMatch(/\/service\//);
  });

  it("appends ?cascade=true when cascade flag is set", async () => {
    await api.removeDmnDeployment("dep-123", { cascade: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toMatch(/\/dmn-api\/dmn-repository\/deployments\/dep-123\?cascade=true$/);
  });

  it("omits the query string when cascade is omitted", async () => {
    await api.removeDmnDeployment("dep-123");
    expect(calls[0]?.url).not.toContain("cascade");
  });
});
