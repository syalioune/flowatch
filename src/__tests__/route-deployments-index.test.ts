// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/deployments` route loader (AC-1, AC-12).
 *
 * The loader is the smallest piece of route-bound logic; the four-state
 * contract is exercised by the E2E suite (e2e/deployments-list.spec.ts).
 * Here we lock in the AC-12 tenantId-omission behaviour and the page-size /
 * sort defaults so a future refactor can't silently change the request shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadDeployments } from "../routes/deployments/index";

describe("/deployments route loader", () => {
  const realConfig = apiModule.api.config;
  const realList = apiModule.api.listDeployments;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    (
      apiModule.api as unknown as { listDeployments: (p: unknown) => Promise<unknown> }
    ).listDeployments = vi.fn((p: unknown) => {
      lastParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "deployTime",
        order: "desc",
      });
    });
  });

  afterEach(() => {
    (apiModule.api as unknown as { listDeployments: typeof realList }).listDeployments = realList;
    (apiModule.api as unknown as { config: typeof realConfig }).config = realConfig;
  });

  it("calls listDeployments with the AC-1 defaults (size 50, sort deployTime desc)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadDeployments();
    expect(lastParams).toMatchObject({ size: 50, sort: "deployTime", order: "desc" });
  });

  it("OMITS tenantId from the params when cfg.tenantId is empty (AC-12)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadDeployments();
    expect(Object.keys(lastParams as object)).not.toContain("tenantId");
  });

  it("PASSES tenantId when cfg.tenantId is non-empty (AC-12)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "acme",
    });
    await loadDeployments();
    expect((lastParams as { tenantId?: string }).tenantId).toBe("acme");
  });
});
