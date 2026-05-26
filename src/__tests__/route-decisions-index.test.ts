// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the `/decisions` route loader (Story 15.1).
 *
 * Asserts that `loadDecisions(tab)` dispatches the correct DMN wrapper per
 * tab. Mirrors the structural shape of route-history-index.test.ts (13.1
 * precedent) — same Vitest + `vi.spyOn(api, ...)` shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../api";
import { loadDecisions } from "../routes/decisions/index";

type ListDecisionsFn = typeof apiModule.api.listDecisions;
type ListDmnDeploymentsFn = typeof apiModule.api.listDmnDeployments;

describe("/decisions route loader", () => {
  const realDecisions = apiModule.api.listDecisions;
  const realDmnDeployments = apiModule.api.listDmnDeployments;
  let lastDecisionsParams: unknown = null;
  let lastDmnDeploymentsParams: unknown = null;
  let decisionsSpy: ReturnType<typeof vi.fn>;
  let dmnDeploymentsSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    lastDecisionsParams = null;
    lastDmnDeploymentsParams = null;
    decisionsSpy = vi.fn((p: unknown) => {
      lastDecisionsParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "id",
        order: "asc",
      });
    });
    dmnDeploymentsSpy = vi.fn((p: unknown) => {
      lastDmnDeploymentsParams = p;
      return Promise.resolve({
        data: [],
        total: 0,
        start: 0,
        size: 50,
        sort: "id",
        order: "asc",
      });
    });
    (apiModule.api as unknown as { listDecisions: ListDecisionsFn }).listDecisions =
      decisionsSpy as unknown as ListDecisionsFn;
    (apiModule.api as unknown as { listDmnDeployments: ListDmnDeploymentsFn }).listDmnDeployments =
      dmnDeploymentsSpy as unknown as ListDmnDeploymentsFn;
  });

  afterEach(() => {
    (apiModule.api as unknown as { listDecisions: ListDecisionsFn }).listDecisions = realDecisions;
    (apiModule.api as unknown as { listDmnDeployments: ListDmnDeploymentsFn }).listDmnDeployments =
      realDmnDeployments;
  });

  it("AC-1 decisions: calls api.listDecisions with size=50", async () => {
    await loadDecisions("decisions");
    expect(lastDecisionsParams).toEqual({ size: 50 });
    expect(dmnDeploymentsSpy).not.toHaveBeenCalled();
  });

  it("AC-1 deployments: calls api.listDmnDeployments with size=50", async () => {
    await loadDecisions("deployments");
    expect(lastDmnDeploymentsParams).toEqual({ size: 50 });
    expect(decisionsSpy).not.toHaveBeenCalled();
  });

  it("AC-1 returns the FlowablePage from the dispatched wrapper", async () => {
    const fake = {
      data: [
        {
          id: "1",
          key: "loanEligibility",
          version: 1,
          deploymentId: "d1",
          name: "Loan Eligibility",
        },
      ],
      total: 1,
      start: 0,
      size: 50,
      sort: "id",
      order: "asc",
    };
    decisionsSpy.mockResolvedValueOnce(fake);
    const result = await loadDecisions("decisions");
    expect(result).toEqual(fake);
  });
});
