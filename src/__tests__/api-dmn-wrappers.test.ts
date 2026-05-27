// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the DMN wrappers under `src/api.ts`.
 *
 * Asserts that the DMN wrappers route through `request()` against the
 * `dmnBase()` prefix (not `/service/...`). Mocks `fetch` so the test is
 * hermetic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

interface CapturedFetch {
  url: string;
  method: string;
}

describe("DMN wrappers", () => {
  let originalFetch: typeof globalThis.fetch;
  let calls: CapturedFetch[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ url, method: init?.method ?? "GET" });
      const method = init?.method ?? "GET";
      if (method === "GET") {
        return new Response(JSON.stringify({ data: [], total: 0, start: 0, size: 50 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("api.removeDmnDeployment", () => {
    it("issues DELETE against /dmn-api/dmn-repository/deployments/{id}", async () => {
      await api.removeDmnDeployment("dep-123");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("DELETE");
      expect(calls[0]?.url).toMatch(/\/dmn-api\/dmn-repository\/deployments\/dep-123$/);
      expect(calls[0]?.url).not.toMatch(/\/service\//);
    });

    it("appends ?cascade=true when cascade flag is set", async () => {
      await api.removeDmnDeployment("dep-123", { cascade: true });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toMatch(
        /\/dmn-api\/dmn-repository\/deployments\/dep-123\?cascade=true$/,
      );
    });

    it("omits the query string when cascade is omitted", async () => {
      await api.removeDmnDeployment("dep-123");
      expect(calls[0]?.url).not.toContain("cascade");
    });
  });

  describe("api.getDmnDecisionResource", () => {
    it("issues GET against /dmn-api/dmn-repository/decision-tables/{id}/resourcedata", async () => {
      await api.getDmnDecisionResource("dec-abc");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url).toMatch(
        /\/dmn-api\/dmn-repository\/decision-tables\/dec-abc\/resourcedata$/,
      );
      expect(calls[0]?.url).not.toMatch(/\/service\//);
    });
  });

  describe("api.listDmnHistoryExecutions", () => {
    it("issues GET against /dmn-api/dmn-history/historic-decision-executions", async () => {
      await api.listDmnHistoryExecutions({ size: 50, sort: "startTime", order: "desc" });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url).toMatch(
        /\/dmn-api\/dmn-history\/historic-decision-executions\?size=50&sort=startTime&order=desc$/,
      );
      expect(calls[0]?.url).not.toMatch(/\/service\//);
    });
  });

  describe("api.getDmnHistoryAuditdata", () => {
    it("issues GET against /dmn-api/dmn-history/historic-decision-executions/{id}/auditdata", async () => {
      await api.getDmnHistoryAuditdata("exec-xyz");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url).toMatch(
        /\/dmn-api\/dmn-history\/historic-decision-executions\/exec-xyz\/auditdata$/,
      );
      expect(calls[0]?.url).not.toMatch(/\/service\//);
    });
  });

  describe("api.getDmnDeployment", () => {
    it("issues GET against /dmn-api/dmn-repository/deployments/{id}", async () => {
      await api.getDmnDeployment("dep-9");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url).toMatch(/\/dmn-api\/dmn-repository\/deployments\/dep-9$/);
      expect(calls[0]?.url).not.toMatch(/\/service\//);
    });
  });

  describe("api.getDmnDeploymentResource", () => {
    it("issues GET against /dmn-api/dmn-repository/deployments/{id}/resourcedata/{name}", async () => {
      await api.getDmnDeploymentResource("dep-9", "loan-eligibility.dmn");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("GET");
      expect(calls[0]?.url).toMatch(
        /\/dmn-api\/dmn-repository\/deployments\/dep-9\/resourcedata\/loan-eligibility\.dmn$/,
      );
      expect(calls[0]?.url).not.toMatch(/\/service\//);
    });

    it("URL-encodes the resource name (spaces, slashes, etc.)", async () => {
      await api.getDmnDeploymentResource("dep-9", "folder/sub name.dmn");
      expect(calls[0]?.url).toMatch(
        /\/dmn-api\/dmn-repository\/deployments\/dep-9\/resourcedata\/folder%2Fsub%20name\.dmn$/,
      );
    });
  });
});
