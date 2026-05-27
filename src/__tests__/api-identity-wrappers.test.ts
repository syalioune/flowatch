// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the identity wrappers in src/api.ts.
 *
 * Pins the verbatim wire shape so a future refactor can't silently
 * change the URL, query params, or HTTP method.
 *
 * Story 14.2 adds `listGroupMembers(groupId, params)` — the
 * `?memberOfGroup={id}` workaround for the missing
 * `GET /identity/groups/{id}/members` in flowable-rest 7.2.
 *
 * Per Pattern P-009: mocks live at window.fetch — never on the api module.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api } from "../api";

const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  API_LOG.length = 0;
  api.setConfig({
    baseUrl: DEFAULT_BASE,
    username: "rest-admin",
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

function mockResponse(opts: { status: number; body?: string; contentType?: string }): Response {
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  return new Response(opts.body ?? "", { status: opts.status, headers });
}

describe("api.listGroupMembers (Story 14.2 ?memberOfGroup workaround)", () => {
  it("GETs /identity/users with the memberOfGroup query param", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [], total: 0, start: 0, size: 50, sort: "id", order: "asc" }),
        contentType: "application/json",
      }),
    );
    await api.listGroupMembers("admin");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/users?memberOfGroup=admin`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("merges extra params (size, sort, start) with the memberOfGroup discriminant", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [], total: 0, start: 0, size: 50, sort: "id", order: "asc" }),
        contentType: "application/json",
      }),
    );
    await api.listGroupMembers("admin", { size: 50, sort: "id" });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("memberOfGroup=admin");
    expect(url).toContain("size=50");
    expect(url).toContain("sort=id");
  });

  it("returns the FlowablePage<FlowableUser> envelope on success", async () => {
    const enginePayload = JSON.stringify({
      data: [
        { id: "rest-admin", firstName: "Admin", lastName: "User", email: "admin@example.com" },
      ],
      total: 1,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    });
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: enginePayload, contentType: "application/json" }),
    );
    const out = await api.listGroupMembers("admin");
    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.id).toBe("rest-admin");
    expect(out.total).toBe(1);
  });
});

describe("api.getUserGroups (Story 14.3 — ?member workaround)", () => {
  it("GETs /identity/groups with the member query param", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 200,
        body: JSON.stringify({ data: [], total: 0, start: 0, size: 50, sort: "id", order: "asc" }),
        contentType: "application/json",
      }),
    );
    await api.getUserGroups("kermit");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups?member=kermit`);
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });

  it("returns the FlowablePage<FlowableGroup> envelope on success", async () => {
    const enginePayload = JSON.stringify({
      data: [{ id: "managers", name: "Managers", type: "assignment" }],
      total: 1,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    });
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, body: enginePayload, contentType: "application/json" }),
    );
    const out = await api.getUserGroups("kermit");
    expect(out.data).toHaveLength(1);
    expect(out.data[0]?.id).toBe("managers");
    expect(out.total).toBe(1);
  });
});

describe("api.addUserToGroup (Story 14.3)", () => {
  it("POSTs /identity/groups/{groupId}/members with body { userId }", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201 }));
    await api.addUserToGroup("kermit", "managers");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups/managers/members`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ userId: "kermit" }));
  });

  it("propagates engine errors so the caller can surface them via toast", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 409, body: "already a member", contentType: "text/plain" }),
    );
    await expect(api.addUserToGroup("kermit", "managers")).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("api.removeUserFromGroup (Story 14.3 symmetric pair)", () => {
  it("DELETEs /identity/groups/{groupId}/members/{userId} with no body or params", async () => {
    // Flowable returns 204 No Content on success; undici forbids a body on
    // 204 so we use 200 + empty body here — the URL + method + lack of body
    // is what the wrapper test pins. Mirrors the group-centric POST above:
    // the inverse user-centric DELETE returns 500 "No endpoint" in 7.2 OSS.
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200 }));
    await api.removeUserFromGroup("rest-admin", "admin");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups/admin/members/rest-admin`);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("propagates engine errors so the caller can surface them via toast", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 404, body: "not found", contentType: "text/plain" }),
    );
    await expect(api.removeUserFromGroup("nobody", "admin")).rejects.toMatchObject({
      status: 404,
    });
  });
});
