// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/tenants` route loader + the 60-second TTL cache
 * on `api.listTenants` (Story 14.4).
 *
 * The cache lives in the api.ts module scope; tests use `vi.stubGlobal`
 * on `fetch` to count the underlying /repository/deployments hits.
 * `__clearTenantsCache` resets the cache between cases.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { __clearTenantsCache, API_LOG } from "../api";
import { loadTenants } from "../routes/tenants";

type ListTenantsFn = typeof apiModule.api.listTenants;

const DEFAULT_BASE = "http://localhost:8080/flowable-rest/service";

const deploymentsResponse = (tenantIds: string[], total?: number): Response => {
  const body = JSON.stringify({
    data: tenantIds.map((id, i) => ({
      id: `d${i}`,
      name: "n",
      deploymentTime: "",
      tenantId: id,
    })),
    total: total ?? tenantIds.length,
    size: 200,
    start: 0,
    sort: "deploymentTime",
    order: "desc",
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

describe("loadTenants", () => {
  const realListTenants = apiModule.api.listTenants;
  let listTenantsSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearTenantsCache();
    listTenantsSpy = vi.fn().mockResolvedValue({ data: [] });
    (apiModule.api as unknown as { listTenants: ListTenantsFn }).listTenants =
      listTenantsSpy as unknown as ListTenantsFn;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listTenants: ListTenantsFn }).listTenants = realListTenants;
  });

  it("calls api.listTenants", async () => {
    await loadTenants();
    expect(listTenantsSpy).toHaveBeenCalledOnce();
  });

  it("returns the tenants envelope verbatim", async () => {
    const fake = { data: [{ id: "acme", name: "acme" }] };
    listTenantsSpy.mockResolvedValueOnce(fake);
    const result = await loadTenants();
    expect(result).toEqual(fake);
  });
});

describe("api.listTenants cache (Story 14.4 AC-4)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearTenantsCache();
    API_LOG.length = 0;
    apiModule.api.setConfig({
      baseUrl: DEFAULT_BASE,
      username: "rest-admin",
      password: "test",
      tenantId: "",
    });
    // setConfig may have cleared the cache and dispatched an event; clear again
    __clearTenantsCache();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    __clearTenantsCache();
  });

  it("caches the derivation for 60 seconds (second call within TTL skips listDeployments)", async () => {
    fetchMock.mockResolvedValueOnce(deploymentsResponse(["acme", "tenant-b"]));
    const first = await apiModule.api.listTenants();
    const second = await apiModule.api.listTenants();
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-derives after the TTL expires", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(deploymentsResponse(["acme"])));
    vi.useFakeTimers();
    try {
      await apiModule.api.listTenants();
      vi.advanceTimersByTime(61_000);
      await apiModule.api.listTenants();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is cleared by __clearTenantsCache", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(deploymentsResponse(["acme"])));
    await apiModule.api.listTenants();
    __clearTenantsCache();
    await apiModule.api.listTenants();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requests /repository/deployments with size=200 (not 1000)", async () => {
    fetchMock.mockResolvedValueOnce(deploymentsResponse(["acme"]));
    await apiModule.api.listTenants();
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/repository/deployments");
    expect(url).toContain("size=200");
    expect(url).not.toContain("size=1000");
  });

  it("filters out deployments with falsy tenantId values", async () => {
    fetchMock.mockResolvedValueOnce(deploymentsResponse(["acme", ""]));
    const result = await apiModule.api.listTenants();
    expect(result.data).toEqual([{ id: "acme", name: "acme" }]);
  });
});
