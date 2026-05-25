// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/tasks` route loader (Story 11.1 AC-1).
 *
 * Mirrors the 9.1 / 9.4 / 10.1 precedent: the loader is the smallest piece
 * of route-bound logic worth pinning; the four-state UI is exercised by
 * the E2E suite (e2e/tasks-list.spec.ts). Here we lock the four-branch
 * request shape (me-with-username / me-without-username / unassigned /
 * all) so a future refactor can't silently change it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadTasks } from "../routes/tasks/index";

describe("/tasks route loader", () => {
  const realConfig = apiModule.api.config;
  const realList = apiModule.api.listTasks;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    (apiModule.api as unknown as { listTasks: (p: unknown) => Promise<unknown> }).listTasks = vi.fn(
      (p: unknown) => {
        lastParams = p;
        return Promise.resolve({ data: [], total: 0, start: 0, size: 50 });
      },
    );
  });

  afterEach(() => {
    (apiModule.api as unknown as { listTasks: typeof realList }).listTasks = realList;
    (apiModule.api as unknown as { config: typeof realConfig }).config = realConfig;
  });

  it("AC-1 me-with-username: passes assignee=<username>, size=50", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "rest-admin",
      password: "p",
      tenantId: "",
    });
    await loadTasks("me");
    expect(lastParams).toEqual({ size: 50, assignee: "rest-admin" });
  });

  it("AC-1 me-without-username: degrades to all (no assignee, no unassigned)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "",
      password: "p",
      tenantId: "",
    });
    await loadTasks("me");
    expect(lastParams).toEqual({ size: 50 });
    expect(Object.keys(lastParams as object)).not.toContain("assignee");
    expect(Object.keys(lastParams as object)).not.toContain("unassigned");
  });

  it("AC-1 unassigned: passes unassigned=true, size=50", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "rest-admin",
      password: "p",
      tenantId: "",
    });
    await loadTasks("unassigned");
    expect(lastParams).toEqual({ size: 50, unassigned: true });
  });

  it("AC-1 all: passes size=50 only (no filter params)", async () => {
    (apiModule.api as unknown as { config: () => apiModule.FlowableConfig }).config = () => ({
      baseUrl: "http://x/y",
      username: "rest-admin",
      password: "p",
      tenantId: "",
    });
    await loadTasks("all");
    expect(lastParams).toEqual({ size: 50 });
  });
});
