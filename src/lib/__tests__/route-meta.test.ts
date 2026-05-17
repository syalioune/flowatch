// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for src/lib/route-meta.ts useRouteMeta().
 *
 * useRouteMeta wraps TanStack Router's useRouterState with a `select`
 * callback that reads the deepest active route's staticData. Detail
 * routes (e.g. /tasks/$id) shadow their list parent — the deepest
 * match wins. We mock @tanstack/react-router so the test owns the
 * matches array and can assert the select() logic in isolation
 * (without standing up a real RouterProvider).
 */

import { describe, expect, it, vi } from "vitest";

interface FakeMatch {
  staticData?: { title?: string; endpoints?: ReadonlyArray<unknown> };
}

let fakeMatches: FakeMatch[] = [];

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (opts: { select: (s: { matches: FakeMatch[] }) => unknown }) =>
    opts.select({ matches: fakeMatches }),
}));

// Imported AFTER vi.mock so the mocked module wins.
const { useRouteMeta } = await import("../route-meta");

describe("useRouteMeta", () => {
  it("returns the deepest match's title + endpoints", () => {
    fakeMatches = [
      { staticData: { title: "Tasks", endpoints: [{ method: "GET", path: "/tasks" }] } },
      {
        staticData: {
          title: "Task detail",
          endpoints: [{ method: "GET", path: "/tasks/$id" }],
        },
      },
    ];
    expect(useRouteMeta()).toEqual({
      title: "Task detail",
      endpoints: [{ method: "GET", path: "/tasks/$id" }],
    });
  });

  it("falls back to Flowatch + [] when no match defines staticData", () => {
    fakeMatches = [{}, {}];
    expect(useRouteMeta()).toEqual({ title: "Flowatch", endpoints: [] });
  });

  it("falls back to defaults when the matches array is empty", () => {
    fakeMatches = [];
    expect(useRouteMeta()).toEqual({ title: "Flowatch", endpoints: [] });
  });

  it("falls back individually — partial staticData uses defaults for missing keys", () => {
    fakeMatches = [{ staticData: { title: "Only title" } }];
    expect(useRouteMeta()).toEqual({ title: "Only title", endpoints: [] });

    fakeMatches = [{ staticData: { endpoints: [{ method: "POST", path: "/x" }] } }];
    expect(useRouteMeta()).toEqual({
      title: "Flowatch",
      endpoints: [{ method: "POST", path: "/x" }],
    });
  });
});
