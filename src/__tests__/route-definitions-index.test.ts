// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/definitions` route loader (AC-1).
 *
 * The four-state UI + optimistic-UI revert path are exercised end-to-end
 * via Playwright (`e2e/definitions-suspend.spec.ts`). This file locks
 * the loader's request shape so a future refactor can't silently change
 * the page size or sort.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadDefinitions } from "../routes/definitions/index";

describe("/definitions route loader", () => {
  const realConfig = apiModule.api.config;
  const realList = apiModule.api.listProcessDefinitions;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    (
      apiModule.api as unknown as { listProcessDefinitions: (p: unknown) => Promise<unknown> }
    ).listProcessDefinitions = vi.fn((p: unknown) => {
      lastParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "name",
        order: "asc",
      });
    });
  });

  afterEach(() => {
    (
      apiModule.api as unknown as { listProcessDefinitions: typeof realList }
    ).listProcessDefinitions = realList;
    (apiModule.api as unknown as { config: typeof realConfig }).config = realConfig;
  });

  it("calls listProcessDefinitions with size=50 and sort=name", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadDefinitions();
    expect(lastParams).toMatchObject({ size: 50, sort: "name" });
  });

  it("OMITS tenantId when cfg.tenantId is empty", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
    await loadDefinitions();
    expect(Object.keys(lastParams as object)).not.toContain("tenantId");
  });

  it("PASSES tenantId when cfg.tenantId is non-empty", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "acme",
    });
    await loadDefinitions();
    expect((lastParams as { tenantId?: string }).tenantId).toBe("acme");
  });
});
