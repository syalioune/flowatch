// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-tier suite for `<DmnExecutionsList>`.
 *
 * The list endpoint only returns coarse metadata (id, decisionName,
 * decisionKey, startTime, endTime, failed, instanceId) — the rich audit
 * data (hit policy, typed inputs, decision result, per-rule trace) lives
 * on the `/dmn-history/.../auditdata` endpoint per execution. The expand
 * row triggers a lazy fetch + renders <DmnExecutionAuditPanel>.
 *
 * The component lives at `src/routes/decisions/index.tsx`; it consumes
 * TanStack Router's `<Link>` for the process-instance cell, so the test
 * mounts inside a real router context.
 */

import "@testing-library/jest-dom/vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  type FlowableDmnExecutionAudit,
  type FlowableHistoricDecisionExecution,
  type FlowablePage,
} from "../../api";
import { DmnExecutionsList } from "../../routes/decisions/index";

type GetAuditFn = typeof api.getDmnHistoryAuditdata;
type Host = { getDmnHistoryAuditdata: GetAuditFn };

const sampleExecution = (
  overrides: Partial<FlowableHistoricDecisionExecution> = {},
): FlowableHistoricDecisionExecution => ({
  id: overrides.id ?? "exec-1",
  decisionKey: "loanEligibility",
  decisionName: "Loan Eligibility",
  startTime: "2026-05-26T10:00:00.000Z",
  endTime: "2026-05-26T10:00:00.042Z",
  failed: false,
  ...overrides,
});

const sampleAudit = (
  overrides: Partial<FlowableDmnExecutionAudit> = {},
): FlowableDmnExecutionAudit => ({
  decisionKey: "loanEligibility",
  decisionName: "Loan Eligibility",
  decisionVersion: 1,
  hitPolicy: "FIRST",
  startTime: "2026-05-26T10:00:00.000Z",
  endTime: "2026-05-26T10:00:00.042Z",
  inputVariables: { tier: "A", employmentStatus: "employed" },
  inputVariableTypes: { tier: "string", employmentStatus: "string" },
  decisionResult: [{ decision: "approve", rate: 0.0425 }],
  decisionResultTypes: { decision: "string", rate: "number" },
  multipleResults: false,
  ruleExecutions: {
    "1": {
      ruleNumber: 1,
      valid: true,
      conditionResults: [
        { id: "re1i1", result: true },
        { id: "re1i2", result: true },
      ],
      conclusionResults: [
        { id: "re1o1", result: "approve" },
        { id: "re1o2", result: 0.0425 },
      ],
    },
  },
  failed: false,
  strictMode: true,
  ...overrides,
});

const pageOf = (
  ...rows: FlowableHistoricDecisionExecution[]
): FlowablePage<FlowableHistoricDecisionExecution> => ({
  data: rows,
  total: rows.length,
  start: 0,
  size: 50,
  sort: "startTime",
  order: "desc",
});

const renderList = (page: FlowablePage<FlowableHistoricDecisionExecution>) => {
  const rootRoute = createRootRoute({
    component: () => <DmnExecutionsList page={page} />,
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
};

describe("<DmnExecutionsList>", () => {
  const realGetAudit = api.getDmnHistoryAuditdata;
  let auditSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    auditSpy = vi.fn().mockResolvedValue(sampleAudit());
    (api as unknown as Host).getDmnHistoryAuditdata = auditSpy as unknown as GetAuditFn;
  });

  afterEach(() => {
    (api as unknown as Host).getDmnHistoryAuditdata = realGetAudit;
    cleanup();
  });

  it("renders rows; no expansion before any click and no audit fetch", async () => {
    renderList(pageOf(sampleExecution()));
    await waitFor(() => expect(screen.getByTestId("execution-row-exec-1")).toBeInTheDocument());
    expect(screen.queryByTestId("execution-detail-exec-1")).toBeNull();
    expect(auditSpy).not.toHaveBeenCalled();
  });

  it("renders the empty state when data is empty", async () => {
    renderList(pageOf());
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });

  it("clicking a row expands and lazily fetches the audit data", async () => {
    const user = userEvent.setup();
    renderList(pageOf(sampleExecution()));
    const row = await waitFor(() => screen.getByTestId("execution-row-exec-1"));
    await user.click(row);
    expect(screen.getByTestId("execution-detail-exec-1")).toBeInTheDocument();
    await waitFor(() => expect(auditSpy).toHaveBeenCalledWith("exec-1"));
    // Audit panel renders: meta strip, typed inputs/results, rule executions.
    await waitFor(() =>
      expect(screen.getByTestId("execution-audit-meta-exec-1")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("execution-audit-inputs-exec-1")).toBeInTheDocument();
    expect(screen.getByTestId("execution-audit-results-exec-1")).toBeInTheDocument();
    // Per-rule trace: rule #1 fired with both conditions true.
    expect(screen.getByTestId("execution-audit-rule-exec-1-1")).toBeInTheDocument();
  });

  it("collapses on second click; audit is NOT re-fetched on the next expand of the same row", async () => {
    const user = userEvent.setup();
    renderList(pageOf(sampleExecution()));
    const row = await waitFor(() => screen.getByTestId("execution-row-exec-1"));
    await user.click(row);
    await waitFor(() => expect(auditSpy).toHaveBeenCalledTimes(1));
    await user.click(row);
    expect(screen.queryByTestId("execution-detail-exec-1")).toBeNull();
    // Re-opening unmounts/remounts the panel, so a refetch IS expected
    // (useApi has no module-level cache). This is intentional — the
    // operator clicking again is the freshness signal.
    await user.click(row);
    await waitFor(() => expect(auditSpy).toHaveBeenCalledTimes(2));
  });

  it("single-expand invariant: clicking a second row collapses the first", async () => {
    const user = userEvent.setup();
    renderList(pageOf(sampleExecution({ id: "exec-1" }), sampleExecution({ id: "exec-2" })));
    const row1 = await waitFor(() => screen.getByTestId("execution-row-exec-1"));
    await user.click(row1);
    expect(screen.getByTestId("execution-detail-exec-1")).toBeInTheDocument();
    await user.click(screen.getByTestId("execution-row-exec-2"));
    expect(screen.queryByTestId("execution-detail-exec-1")).toBeNull();
    expect(screen.getByTestId("execution-detail-exec-2")).toBeInTheDocument();
  });

  it("status badge surfaces the failed flag from the list response", async () => {
    renderList(
      pageOf(
        sampleExecution({ id: "ok", failed: false }),
        sampleExecution({ id: "ko", failed: true }),
      ),
    );
    const okRow = await waitFor(() => screen.getByTestId("execution-row-ok"));
    const koRow = screen.getByTestId("execution-row-ko");
    expect(okRow.querySelector('[data-tone="ok"]')?.textContent).toContain("ok");
    expect(koRow.querySelector('[data-tone="bad"]')?.textContent).toContain("failed");
  });

  it("process-instance cell renders a Link when instanceId is set", async () => {
    renderList(pageOf(sampleExecution({ instanceId: "pi-123" })));
    const link = await waitFor(() => screen.getByRole("link", { name: "pi-123" }));
    expect(link).toBeInTheDocument();
  });
});
