// SPDX-License-Identifier: Apache-2.0

/**
 * Browser-tier suite for `<DmnExecutionsList>` (Story 15.4).
 *
 * The component lives at `src/routes/decisions/index.tsx`; it consumes
 * TanStack Router's `<Link>` for the process-instance cell, so the test
 * mounts inside a real router context per RC-10.
 *
 * Covers: initial render, row-expand toggle, single-expand invariant,
 * empty-state rendering, hit-policy badge tone mapping, and process-
 * instance link rendering.
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
import { afterEach, describe, expect, it } from "vitest";
import type { FlowableHistoricDecisionExecution, FlowablePage } from "../../api";
import { DmnExecutionsList } from "../../routes/decisions/index";

const sampleExecution = (
  overrides: Partial<FlowableHistoricDecisionExecution> = {},
): FlowableHistoricDecisionExecution => ({
  id: overrides.id ?? "exec-1",
  decisionKey: "loanEligibility",
  decisionName: "Loan Eligibility",
  startTime: "2026-05-26T10:00:00.000Z",
  durationInMillis: 42,
  hitPolicy: "UNIQUE",
  inputVariables: { creditScore: 750, income: 80000 },
  outputVariables: { tier: "A", approved: true },
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

describe("<DmnExecutionsList> (Story 15.4)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders rows; no expansion before any click", async () => {
    renderList(pageOf(sampleExecution()));
    await waitFor(() => expect(screen.getByTestId("execution-row-exec-1")).toBeInTheDocument());
    expect(screen.queryByTestId("execution-detail-exec-1")).toBeNull();
  });

  it("renders the empty state when data is empty", async () => {
    renderList(pageOf());
    await waitFor(() => expect(screen.getByTestId("empty-state")).toBeInTheDocument());
  });

  it("clicking a row expands the detail panel below", async () => {
    const user = userEvent.setup();
    renderList(pageOf(sampleExecution()));
    const row = await waitFor(() => screen.getByTestId("execution-row-exec-1"));
    await user.click(row);
    expect(screen.getByTestId("execution-detail-exec-1")).toBeInTheDocument();
    // Variable testids render via the shared DecisionVariableTable helper.
    expect(screen.getByTestId("execution-input-exec-1-creditScore")).toBeInTheDocument();
    expect(screen.getByTestId("execution-output-exec-1-tier")).toBeInTheDocument();
  });

  it("clicking the expanded row again collapses it", async () => {
    const user = userEvent.setup();
    renderList(pageOf(sampleExecution()));
    const row = await waitFor(() => screen.getByTestId("execution-row-exec-1"));
    await user.click(row);
    expect(screen.getByTestId("execution-detail-exec-1")).toBeInTheDocument();
    await user.click(row);
    expect(screen.queryByTestId("execution-detail-exec-1")).toBeNull();
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

  it("hit-policy badge tone reflects the policy", async () => {
    renderList(
      pageOf(
        sampleExecution({ id: "u", hitPolicy: "UNIQUE" }),
        sampleExecution({ id: "c", hitPolicy: "COLLECT" }),
        sampleExecution({ id: "p", hitPolicy: "PRIORITY" }),
      ),
    );
    // The badge lives inside the row. We assert tone via the data-tone attribute.
    const uRow = await waitFor(() => screen.getByTestId("execution-row-u"));
    const cRow = screen.getByTestId("execution-row-c");
    const pRow = screen.getByTestId("execution-row-p");
    expect(uRow.querySelector('[data-tone="ok"]')?.textContent).toContain("UNIQUE");
    expect(cRow.querySelector('[data-tone="warn"]')?.textContent).toContain("COLLECT");
    expect(pRow.querySelector('[data-tone="neutral"]')?.textContent).toContain("PRIORITY");
  });

  it("process-instance cell renders a Link when processInstanceId is set", async () => {
    renderList(pageOf(sampleExecution({ processInstanceId: "pi-123" })));
    // The Link renders a real <a> tag inside the row.
    const link = await waitFor(() => screen.getByRole("link", { name: "pi-123" }));
    expect(link).toBeInTheDocument();
  });
});
