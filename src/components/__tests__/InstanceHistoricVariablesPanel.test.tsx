// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceHistoricVariablesPanel> — seventh panel-as-sibling
 * consumer. Covers the four-state contract, the RC-12 nested
 * `variable.{name,type,value,scope}` shape, the per-cell render branches
 * (string / json / primitive / null), and the Refresh affordance.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableHistoricVariable, type FlowablePage } from "../../api";
import {
  fetchHistoricVariablesOrNull,
  InstanceHistoricVariablesPanel,
} from "../InstanceHistoricVariablesPanel";

type ListFn = typeof api.listHistoricVariables;
type Host = { listHistoricVariables: ListFn };

const VAR_STRING: FlowableHistoricVariable = {
  id: "v-1",
  processInstanceId: "pi-1",
  executionId: "pi-1",
  variable: { name: "initiator", type: "string", value: "rest-admin", scope: "global" },
};

const VAR_JSON: FlowableHistoricVariable = {
  id: "v-2",
  processInstanceId: "pi-1",
  executionId: "pi-1",
  variable: {
    name: "payload",
    type: "json",
    value: { user: "alice", level: 2 },
    scope: "global",
  },
};

const VAR_INT: FlowableHistoricVariable = {
  id: "v-3",
  processInstanceId: "pi-1",
  taskId: "task-1",
  variable: { name: "amount", type: "integer", value: 1000, scope: "local" },
};

const page = (data: FlowableHistoricVariable[]): FlowablePage<FlowableHistoricVariable> => ({
  data,
  total: data.length,
  start: 0,
  size: 200,
  sort: "variableName",
  order: "asc",
});

describe("fetchHistoricVariablesOrNull status-aware probe", () => {
  const real = api.listHistoricVariables;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listHistoricVariables = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listHistoricVariables = real;
  });

  it("returns the data array on success and forwards the processInstanceId param", async () => {
    spy.mockResolvedValue(page([VAR_STRING]));
    const out = await fetchHistoricVariablesOrNull("pi-1");
    expect(out).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith({ processInstanceId: "pi-1", size: 200 });
  });

  it("returns null on a 404 (defensive — engine usually returns empty data)", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    const out = await fetchHistoricVariablesOrNull("pi-1");
    expect(out).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    spy.mockRejectedValue(new FlowableError("Boom", 500));
    await expect(fetchHistoricVariablesOrNull("pi-1")).rejects.toThrow("Boom");
  });
});

describe("<InstanceHistoricVariablesPanel>", () => {
  const real = api.listHistoricVariables;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn();
    (api as unknown as Host).listHistoricVariables = spy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as Host).listHistoricVariables = real;
    cleanup();
  });

  it("renders the loading skeleton while in-flight", async () => {
    spy.mockReturnValue(new Promise(() => undefined));
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders the empty state when data is empty []", async () => {
    spy.mockResolvedValue(page([]));
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    expect(await screen.findByText("No historic variables for this instance.")).toBeInTheDocument();
  });

  it("renders the empty state on a 404", async () => {
    spy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    expect(await screen.findByText("No historic variables for this instance.")).toBeInTheDocument();
  });

  it("renders <ErrorBox> on a non-404 engine error", async () => {
    spy.mockRejectedValue(new FlowableError("Server explosion", 500));
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    expect(await screen.findByTestId("error-box")).toBeInTheDocument();
    expect(screen.getByText(/Server explosion/)).toBeInTheDocument();
  });

  it("reads the RC-12 nested variable.{name,type,value,scope} shape and renders rows", async () => {
    spy.mockResolvedValue(page([VAR_STRING, VAR_JSON, VAR_INT]));
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("initiator")).toBeInTheDocument());
    // Names
    expect(screen.getByText("payload")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();
    // Type badges
    expect(screen.getByText("string")).toBeInTheDocument();
    expect(screen.getByText("json")).toBeInTheDocument();
    expect(screen.getByText("integer")).toBeInTheDocument();
    // Scope badges
    expect(screen.getAllByText("global").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("local")).toBeInTheDocument();
    // Values
    expect(screen.getByText('"rest-admin"')).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    // JSON value rendered inside a <pre>
    const pre = screen.getByText(/"alice"/);
    expect(pre.tagName).toBe("PRE");
  });

  it("renders a row-count badge in the header when data is populated", async () => {
    spy.mockResolvedValue(page([VAR_STRING, VAR_INT]));
    const { container } = render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    await waitFor(() => expect(screen.getByText("initiator")).toBeInTheDocument());
    const badge = container.querySelector(".panel-hd .badge");
    // Strip the Story 18.2 sr-only prefix ("Count: ") from textContent.
    const visibleText = badge?.textContent?.replace(/^Count:\s*/, "").trim();
    expect(visibleText).toBe("2");
  });

  it("Refresh button triggers a second fetch and is disabled while loading", async () => {
    let resolveFirst!: (v: FlowablePage<FlowableHistoricVariable>) => void;
    spy.mockReturnValueOnce(
      new Promise<FlowablePage<FlowableHistoricVariable>>((res) => {
        resolveFirst = res;
      }),
    );
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    const btn = await screen.findByTestId("historic-variables-refresh");
    expect(btn).toBeDisabled();
    spy.mockResolvedValue(page([VAR_STRING]));
    resolveFirst(page([VAR_STRING]));
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it("anchors the panel with data-testid='instance-historic-variables-panel'", async () => {
    spy.mockResolvedValue(page([VAR_STRING]));
    render(<InstanceHistoricVariablesPanel instanceId="pi-1" />);
    await waitFor(() =>
      expect(screen.getByTestId("instance-historic-variables-panel")).toBeInTheDocument(),
    );
  });
});
