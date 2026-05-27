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
type ListGroupsFn = typeof apiModule.api.listGroups;

describe("/identity route loader", () => {
  const realListUsers = apiModule.api.listUsers;
  const realListGroups = apiModule.api.listGroups;
  let listUsersSpy: ReturnType<typeof vi.fn>;
  let listGroupsSpy: ReturnType<typeof vi.fn>;
  let lastUsersParams: unknown = null;
  let lastGroupsParams: unknown = null;

  beforeEach(() => {
    lastUsersParams = null;
    lastGroupsParams = null;
    listUsersSpy = vi.fn((p: unknown) => {
      lastUsersParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "id",
        order: "asc",
      });
    });
    listGroupsSpy = vi.fn((p: unknown) => {
      lastGroupsParams = p;
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
    (apiModule.api as unknown as { listGroups: ListGroupsFn }).listGroups =
      listGroupsSpy as unknown as ListGroupsFn;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listUsers: ListUsersFn }).listUsers = realListUsers;
    (apiModule.api as unknown as { listGroups: ListGroupsFn }).listGroups = realListGroups;
  });

  it("calls api.listUsers with size 50 when tab is 'users'", async () => {
    await loadIdentity("users");
    expect(listUsersSpy).toHaveBeenCalledOnce();
    expect(listGroupsSpy).not.toHaveBeenCalled();
    expect(lastUsersParams).toEqual({ size: 50 });
  });

  it("calls api.listGroups with size 50 when tab is 'groups'", async () => {
    await loadIdentity("groups");
    expect(listGroupsSpy).toHaveBeenCalledOnce();
    expect(listUsersSpy).not.toHaveBeenCalled();
    expect(lastGroupsParams).toEqual({ size: 50 });
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

  it("returns the FlowablePage from api.listGroups", async () => {
    const fake = {
      data: [{ id: "admin", name: "Admin group", type: "security" }],
      total: 1,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    };
    listGroupsSpy.mockResolvedValueOnce(fake);
    const result = await loadIdentity("groups");
    expect(result).toEqual(fake);
  });
});
