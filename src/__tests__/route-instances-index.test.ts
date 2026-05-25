// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/instances` route loader (Story 10.1 AC-1).
 *
 * Mirrors the 9.1 (route-deployments-index.test.ts) and 9.4
 * (route-definitions-index.test.ts) precedent: the loader is the smallest
 * piece of route-bound logic worth pinning; the four-state UI is exercised
 * by the E2E suite (e2e/instances-list.spec.ts). Here we lock the request
 * shape (size 50, sort startTime desc, tenantId-omission) so a future
 * refactor can't silently change it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadProcessInstances } from "../routes/instances/index";

describe("/instances route loader", () => {
  const realConfig = apiModule.api.config;
  const realList = apiModule.api.listProcessInstances;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    (
      apiModule.api as unknown as { listProcessInstances: (p: unknown) => Promise<unknown> }
    ).listProcessInstances = vi.fn((p: unknown) => {
      lastParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "startTime",
        order: "desc",
      });
    });
  });

  afterEach(() => {
    (apiModule.api as unknown as { listProcessInstances: typeof realList }).listProcessInstances =
      realList;
    (apiModule.api as unknown as { config: typeof realConfig }).config = realConfig;
  });

  it("calls listProcessInstances with the AC-1 defaults (size 50, sort startTime desc)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadProcessInstances();
    expect(lastParams).toMatchObject({ size: 50, sort: "startTime", order: "desc" });
  });

  it("OMITS tenantId when cfg.tenantId is empty", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadProcessInstances();
    expect(Object.keys(lastParams as object)).not.toContain("tenantId");
  });

  it("PASSES tenantId when cfg.tenantId is non-empty", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "acme",
    });
    await loadProcessInstances();
    expect((lastParams as { tenantId?: string }).tenantId).toBe("acme");
  });
});
