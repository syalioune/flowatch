// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for the Epic 22 identity-write wrappers
 * (createUser / updateUser / deleteUser / createGroup / updateGroup /
 * deleteGroup) in src/api.ts.
 *
 * Split out of src/__tests__/request.test.ts to keep both files under the
 * NFR-21 50 KB per-file navigability limit (CLAUDE.md "Single-source file
 * size limit"). Reuses the same fetchMock + mockResponse + API_LOG patterns;
 * see request.test.ts header for the funnel + Pattern P-001 / P-003 / P-009
 * rationale.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_LOG, api } from "../api";

let fetchMock: ReturnType<typeof vi.fn>;

const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";

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

interface MockResponseOpts {
  status: number;
  body?: string;
  json?: unknown;
  contentType?: string;
}

function mockResponse(opts: MockResponseOpts): Response {
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  else if (opts.json !== undefined) headers.set("content-type", "application/json");
  const bodyText = opts.body ?? (opts.json !== undefined ? JSON.stringify(opts.json) : "");
  return new Response(bodyText, { status: opts.status, headers });
}

describe("api.createUser (Story 22.1)", () => {
  it("POSTs /identity/users with the full body", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        status: 201,
        json: { id: "alice", firstName: "Alice", lastName: "Smith", email: "a@b.c" },
      }),
    );
    const out = await api.createUser({
      id: "alice",
      firstName: "Alice",
      lastName: "Smith",
      email: "a@b.c",
      password: "s3cret",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/users`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({
        id: "alice",
        firstName: "Alice",
        lastName: "Smith",
        email: "a@b.c",
        password: "s3cret",
      }),
    );
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(out).toMatchObject({ id: "alice", firstName: "Alice" });
  });

  it("POSTs id-only body when only id is provided", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, json: { id: "bob" } }));
    await api.createUser({ id: "bob" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"id":"bob"}');
  });

  it("API_LOG captures method POST + object body + redacted Authorization", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, json: { id: "carol" } }));
    await api.createUser({ id: "carol", email: "c@x" });
    expect(API_LOG[0]?.method).toBe("POST");
    expect(API_LOG[0]?.path).toBe("/identity/users");
    expect(API_LOG[0]?.body).toEqual({ id: "carol", email: "c@x" });
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
  });

  it("rejects with FlowableError on 4xx duplicate-id (verbatim engine message)", async () => {
    const engineBody = '{"errorMessage":"User already exists","exception":"..."}';
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 409, body: engineBody }));
    await expect(api.createUser({ id: "dup" })).rejects.toMatchObject({
      status: 409,
      message: engineBody,
    });
    expect(API_LOG[0]?.status).toBe(409);
    expect(API_LOG[0]?.error).toBe(engineBody);
  });

  it("rejects with FlowableError on 400 (engine validates id non-null)", async () => {
    const engineBody = "Bad request: Id cannot be null";
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 400, body: engineBody }));
    // The wrapper does not pre-validate — the engine is the source of truth.
    await expect(api.createUser({ id: "" })).rejects.toMatchObject({
      status: 400,
      message: engineBody,
    });
  });

  it("resolves on 201 with parsed FlowableUser echo", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 201, json: { id: "ed", firstName: "Ed" } }),
    );
    const u = await api.createUser({ id: "ed", firstName: "Ed", password: "x" });
    expect(u).toEqual({ id: "ed", firstName: "Ed" });
  });
});

describe("api.updateUser (Story 22.2)", () => {
  it("PUTs /identity/users/{id} with a single-field body", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, json: { id: "alice", firstName: "Alicia" } }),
    );
    const out = await api.updateUser("alice", { firstName: "Alicia" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/users/alice`);
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"firstName":"Alicia"}');
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(API_LOG[0]?.method).toBe("PUT");
    expect(API_LOG[0]?.body).toEqual({ firstName: "Alicia" });
    expect(out).toMatchObject({ id: "alice", firstName: "Alicia" });
  });

  it("PUTs a multi-field body including empty string and password", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { id: "alice" } }));
    await api.updateUser("alice", { email: "", password: "x" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"email":"","password":"x"}');
  });

  it("encodes special characters in user id", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { id: "alice.smith" } }));
    await api.updateUser("alice.smith", { firstName: "x" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${DEFAULT_BASE}/identity/users/alice.smith`);
  });

  it("throws synchronously when fields is empty", () => {
    expect(() => api.updateUser("alice", {})).toThrow("updateUser requires at least one field");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(API_LOG.length).toBe(0);
  });

  it("rejects with FlowableError on 4xx", async () => {
    const engineBody = '{"message":"Not Found","exception":"user alice not found"}';
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: engineBody }));
    await expect(api.updateUser("alice", { firstName: "x" })).rejects.toMatchObject({
      status: 404,
      message: engineBody,
    });
    expect(API_LOG[0]?.error).toBe(engineBody);
  });

  it("API_LOG records redacted Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { id: "alice" } }));
    await api.updateUser("alice", { firstName: "x" });
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
  });
});

describe("api.deleteUser (Story 22.2)", () => {
  it("DELETEs /identity/users/{id}", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteUser("alice");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/users/alice`);
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
    expect(API_LOG[0]?.method).toBe("DELETE");
    expect(API_LOG[0]?.status).toBe(204);
  });

  it("encodes special characters in user id", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteUser("user.with.dots");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${DEFAULT_BASE}/identity/users/user.with.dots`);
  });

  it("rejects with FlowableError on 404 (verbatim engine message)", async () => {
    const engineBody = '{"message":"Not Found","exception":"user gone not found"}';
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: engineBody }));
    await expect(api.deleteUser("gone")).rejects.toMatchObject({
      status: 404,
      message: engineBody,
    });
  });

  it("resolves on 204 with empty-body API_LOG entry", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.deleteUser("alice")).resolves.not.toThrow();
    expect(API_LOG[0]?.status).toBe(204);
    expect(API_LOG[0]?.error).toBeUndefined();
  });
});

describe("api.createGroup (Story 22.3)", () => {
  it("POSTs /identity/groups with the full body", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 201, json: { id: "g1", name: "G1", type: "assignment" } }),
    );
    const out = await api.createGroup({ id: "g1", name: "G1", type: "assignment" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"id":"g1","name":"G1","type":"assignment"}');
    expect(out).toMatchObject({ id: "g1", name: "G1" });
  });

  it("POSTs id-only body", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, json: { id: "g2" } }));
    await api.createGroup({ id: "g2" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"id":"g2"}');
  });

  it("rejects with FlowableError on 409 duplicate-id", async () => {
    const engineBody = '{"errorMessage":"already exists"}';
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 409, body: engineBody }));
    await expect(api.createGroup({ id: "dup" })).rejects.toMatchObject({
      status: 409,
      message: engineBody,
    });
  });

  it("API_LOG records POST + body + redacted auth", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 201, json: { id: "g3" } }));
    await api.createGroup({ id: "g3" });
    expect(API_LOG[0]?.method).toBe("POST");
    expect(API_LOG[0]?.body).toEqual({ id: "g3" });
    expect(API_LOG[0]?.headers?.Authorization).toBe("Basic ***");
  });
});

describe("api.updateGroup (Story 22.3)", () => {
  it("PUTs /identity/groups/{id} with a single-field body", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({ status: 200, json: { id: "g1", name: "renamed" } }),
    );
    await api.updateGroup("g1", { name: "renamed" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups/g1`);
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"name":"renamed"}');
  });

  it("PUTs multi-field body", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { id: "g1" } }));
    await api.updateGroup("g1", { name: "n", type: "security" });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe('{"name":"n","type":"security"}');
  });

  it("encodes special characters in id", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 200, json: { id: "g.dot" } }));
    await api.updateGroup("g.dot", { name: "x" });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups/g.dot`);
  });

  it("throws synchronously when fields is empty", () => {
    expect(() => api.updateGroup("g1", {})).toThrow("updateGroup requires at least one field");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects with FlowableError on 4xx", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: "not found" }));
    await expect(api.updateGroup("gone", { name: "x" })).rejects.toMatchObject({
      status: 404,
      message: "not found",
    });
  });
});

describe("api.deleteGroup (Story 22.3)", () => {
  it("DELETEs /identity/groups/{id}", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteGroup("g1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups/g1`);
    expect(init.method).toBe("DELETE");
    expect(API_LOG[0]?.status).toBe(204);
  });

  it("encodes special characters in id", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await api.deleteGroup("group.with.dots");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${DEFAULT_BASE}/identity/groups/group.with.dots`);
  });

  it("rejects with FlowableError on 404", async () => {
    fetchMock.mockResolvedValueOnce(mockResponse({ status: 404, body: "gone" }));
    await expect(api.deleteGroup("gone")).rejects.toMatchObject({ status: 404 });
  });

  it("resolves on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api.deleteGroup("g1")).resolves.not.toThrow();
  });
});
