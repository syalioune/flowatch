// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/identity` route loader (Story 14.1).
 *
 * Story 14.1 introduces `loadIdentity(tab)` with two branches:
 *   - `users`  → api.listUsers({size: 50})
 *   - `groups` → null  (legacy shim path; the route mounts the shim
 *                       inline without going through the loader)
 *
 * Story 14.2 extends this loader to dispatch to api.listGroups for the
 * groups tab — at that point the `null` return goes away.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadIdentity } from "../routes/identity/index";

type ListUsersFn = typeof apiModule.api.listUsers;

describe("/identity route loader", () => {
  const realListUsers = apiModule.api.listUsers;
  let listUsersSpy: ReturnType<typeof vi.fn>;
  let lastParams: unknown = null;

  beforeEach(() => {
    lastParams = null;
    listUsersSpy = vi.fn((p: unknown) => {
      lastParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "id",
        order: "asc",
      });
    });
    (apiModule.api as unknown as { listUsers: ListUsersFn }).listUsers =
      listUsersSpy as unknown as ListUsersFn;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listUsers: ListUsersFn }).listUsers = realListUsers;
  });

  it("returns null when tab is 'groups' (legacy shim path)", () => {
    const result = loadIdentity("groups");
    expect(result).toBeNull();
    expect(listUsersSpy).not.toHaveBeenCalled();
  });

  it("calls api.listUsers with size 50 when tab is 'users'", async () => {
    const result = loadIdentity("users");
    expect(result).not.toBeNull();
    await result;
    expect(listUsersSpy).toHaveBeenCalledOnce();
    expect(lastParams).toEqual({ size: 50 });
  });

  it("returns the FlowablePage from api.listUsers", async () => {
    const fake = {
      data: [{ id: "u1", firstName: "Mira", lastName: "Test" }],
      total: 1,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    };
    listUsersSpy.mockResolvedValueOnce(fake);
    const result = await loadIdentity("users");
    expect(result).toEqual(fake);
  });
});
