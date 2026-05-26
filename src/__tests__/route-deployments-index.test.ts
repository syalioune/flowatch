// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/deployments` route loader.
 *
 * The loader is the smallest piece of route-bound logic; the four-state
 * contract is exercised by the E2E suite (e2e/deployments-list.spec.ts).
 * Here we lock in:
 *   - the AC-12 tenantId-omission behaviour and the page-size / sort defaults
 *     so a future refactor can't silently change the request shape,
 *   - the dual BPMN + DMN fetch + merge + soft-fail-on-DMN behaviour added
 *     after Story 15.4 (the operator's mental model is "every deployment
 *     on this engine," not "BPMN only").
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlowableDeployment, FlowablePage } from "../api";
import * as apiModule from "../api";
import { loadDeployments } from "../routes/deployments/index";

type ListFn = (p: unknown) => Promise<FlowablePage<FlowableDeployment>>;
type ListHost = { listDeployments: ListFn; listDmnDeployments: ListFn };
type ConfigHost = { config: () => apiModule.FlowableConfig };

function emptyPage(): FlowablePage<FlowableDeployment> {
  return { data: [], total: 0, start: 0, size: 50, sort: "deployTime", order: "desc" };
}

function dep(id: string, t: string, tenantId = ""): FlowableDeployment {
  return { id, name: id, deploymentTime: t, tenantId };
}

describe("/deployments route loader", () => {
  const realConfig = apiModule.api.config;
  const realList = apiModule.api.listDeployments;
  const realListDmn = apiModule.api.listDmnDeployments;
  let bpmnParams: unknown = null;
  let dmnParams: unknown = null;
  let bpmnImpl: ListFn = () => Promise.resolve(emptyPage());
  let dmnImpl: ListFn = () => Promise.resolve(emptyPage());

  beforeEach(() => {
    bpmnParams = null;
    dmnParams = null;
    (apiModule.api as unknown as ListHost).listDeployments = vi.fn((p: unknown) => {
      bpmnParams = p;
      return bpmnImpl(p);
    });
    (apiModule.api as unknown as ListHost).listDmnDeployments = vi.fn((p: unknown) => {
      dmnParams = p;
      return dmnImpl(p);
    });
    (apiModule.api as unknown as ConfigHost).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "",
    });
  });

  afterEach(() => {
    (apiModule.api as unknown as ListHost).listDeployments = realList as unknown as ListFn;
    (apiModule.api as unknown as ListHost).listDmnDeployments = realListDmn as unknown as ListFn;
    (apiModule.api as unknown as ConfigHost).config = realConfig;
    bpmnImpl = () => Promise.resolve(emptyPage());
    dmnImpl = () => Promise.resolve(emptyPage());
  });

  it("calls listDeployments with the AC-1 defaults (size 50, sort deployTime desc)", async () => {
    await loadDeployments();
    expect(bpmnParams).toMatchObject({ size: 50, sort: "deployTime", order: "desc" });
  });

  it("OMITS tenantId from both BPMN and DMN params when cfg.tenantId is empty (AC-12)", async () => {
    await loadDeployments();
    expect(Object.keys(bpmnParams as object)).not.toContain("tenantId");
    expect(Object.keys(dmnParams as object)).not.toContain("tenantId");
  });

  it("PASSES tenantId to both BPMN and DMN params when cfg.tenantId is non-empty", async () => {
    (apiModule.api as unknown as ConfigHost).config = () => ({
      baseUrl: "http://x/y",
      username: "u",
      password: "p",
      tenantId: "acme",
    });
    await loadDeployments();
    expect((bpmnParams as { tenantId?: string }).tenantId).toBe("acme");
    expect((dmnParams as { tenantId?: string }).tenantId).toBe("acme");
  });

  it("DOES NOT pass sort/order to DMN (the DMN list endpoint uses a different sort vocabulary)", async () => {
    await loadDeployments();
    const params = dmnParams as Record<string, unknown>;
    expect(params.sort).toBeUndefined();
    expect(params.order).toBeUndefined();
  });

  it("merges BPMN + DMN rows, tags each with kind, sorts by deploymentTime desc", async () => {
    bpmnImpl = () =>
      Promise.resolve({
        ...emptyPage(),
        data: [dep("b1", "2026-05-26T10:00:00Z"), dep("b2", "2026-05-26T08:00:00Z")],
      });
    dmnImpl = () =>
      Promise.resolve({
        ...emptyPage(),
        data: [dep("d1", "2026-05-26T11:00:00Z"), dep("d2", "2026-05-26T09:00:00Z")],
      });
    const result = await loadDeployments();
    expect(result.dmnError).toBeNull();
    expect(result.data.map((r) => `${r.kind}:${r.id}`)).toEqual([
      "dmn:d1",
      "bpmn:b1",
      "dmn:d2",
      "bpmn:b2",
    ]);
  });

  it("soft-fails on DMN endpoint error — BPMN rows still render + dmnError carries the engine message", async () => {
    bpmnImpl = () => Promise.resolve({ ...emptyPage(), data: [dep("b1", "2026-05-26T10:00:00Z")] });
    dmnImpl = () => Promise.reject(new Error("No endpoint POST /flowable-rest/dmn-api/…"));
    const result = await loadDeployments();
    expect(result.data.map((r) => r.id)).toEqual(["b1"]);
    expect(result.data[0]?.kind).toBe("bpmn");
    expect(result.dmnError).toBe("No endpoint POST /flowable-rest/dmn-api/…");
  });

  it("BPMN endpoint failure THROWS — preserves the route's errorComponent slot", async () => {
    bpmnImpl = () => Promise.reject(new Error("HTTP 500"));
    dmnImpl = () => Promise.resolve(emptyPage());
    await expect(loadDeployments()).rejects.toThrow("HTTP 500");
  });
});
