// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <InstanceVariablesPanel> + helpers (Story 10.4).
 *
 * Covers AC-4 / AC-5 / AC-7 via `prettyJson`, AC-2 via `typeTone`, and the
 * panel's four-state contract + per-value-type rendering branches under jsdom.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableVariable } from "../../api";
import {
  InstanceVariablesPanel,
  prettyJson,
  typeTone,
  VALUE_RENDER_BUDGET,
} from "../InstanceVariablesPanel";

type GetVarsFn = (id: string) => Promise<FlowableVariable[]>;
type GetVarsHost = { getProcessInstanceVariables: GetVarsFn };

describe("prettyJson", () => {
  it("pretty-prints a JSON object with two-space indent", () => {
    expect(prettyJson({ a: 1, b: "two" })).toBe('{\n  "a": 1,\n  "b": "two"\n}');
  });

  it('returns "(non-serializable)" when stringify throws (BigInt)', () => {
    expect(prettyJson(BigInt(10))).toBe("(non-serializable)");
  });

  it('returns "(non-serializable)" when stringify throws (circular ref)', () => {
    type Node = { name: string; self?: Node };
    const circular: Node = { name: "loop" };
    circular.self = circular;
    expect(prettyJson(circular)).toBe("(non-serializable)");
  });

  it("truncates values above VALUE_RENDER_BUDGET with a suffix carrying the overflow", () => {
    const huge = { data: "x".repeat(VALUE_RENDER_BUDGET + 50) };
    const result = prettyJson(huge);
    expect(result).toMatch(/… \(truncated; \d+ more chars\)$/);
    expect(result.length).toBeLessThan(VALUE_RENDER_BUDGET + 100);
  });

  it('returns "(non-serializable)" for an undefined-stringify (function)', () => {
    expect(prettyJson(() => "noop")).toBe("(non-serializable)");
  });
});

describe("typeTone", () => {
  it('returns "ok" for json + string', () => {
    expect(typeTone("json")).toBe("ok");
    expect(typeTone("string")).toBe("ok");
  });

  it('returns "mute" for numeric/boolean types', () => {
    expect(typeTone("boolean")).toBe("mute");
    expect(typeTone("integer")).toBe("mute");
    expect(typeTone("long")).toBe("mute");
    expect(typeTone("double")).toBe("mute");
    expect(typeTone("short")).toBe("mute");
  });

  it('returns "warn" for null / undefined / unknown', () => {
    expect(typeTone("null")).toBe("warn");
    expect(typeTone(undefined)).toBe("warn");
    expect(typeTone("mystery")).toBe("warn");
  });
});

describe("<InstanceVariablesPanel>", () => {
  const realGet = api.getProcessInstanceVariables;
  let getSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSpy = vi.fn();
    (api as unknown as GetVarsHost).getProcessInstanceVariables = getSpy as unknown as GetVarsFn;
  });

  afterEach(() => {
    (api as unknown as GetVarsHost).getProcessInstanceVariables = realGet;
    cleanup();
  });

  it("renders loading skeleton while in-flight", async () => {
    getSpy.mockReturnValue(new Promise(() => undefined));
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders the EmptyState entry when the engine returns an empty list", async () => {
    getSpy.mockResolvedValue([]);
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("No variables.")).toBeInTheDocument());
    expect(screen.getByText(/global or local variables/i)).toBeInTheDocument();
  });

  it("renders ErrorBox with retry on engine failure", async () => {
    getSpy.mockRejectedValue(new FlowableError("Boom", 500));
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByTestId("error-box")).toBeInTheDocument());
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("renders the populated table with Name / Type / Scope / Value / Edit columns", async () => {
    getSpy.mockResolvedValue([
      { name: "amount", value: 1000, type: "integer" },
      { name: "currency", value: "EUR", type: "string", scope: "local" },
    ]);
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("amount")).toBeInTheDocument());
    // Type badge + scope badge
    expect(screen.getByText("integer")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
    // Value rendering: integer = "1000", string = quoted
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.getByText('"EUR"')).toBeInTheDocument();
    // Two Edit placeholders, both disabled
    const editButtons = screen.getAllByTestId("variable-edit-placeholder");
    expect(editButtons).toHaveLength(2);
    for (const btn of editButtons) {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("title", "Available in 0.0.3 (Story 19.1)");
    }
  });

  it("renders json variable values pretty-printed inside <pre>", async () => {
    getSpy.mockResolvedValue([
      { name: "payload", value: { user: "alice", level: 2 }, type: "json" },
    ]);
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("payload")).toBeInTheDocument());
    const pre = screen.getByText(/"alice"/);
    expect(pre.tagName).toBe("PRE");
  });

  it("renders null variable values as a muted 'null'", async () => {
    getSpy.mockResolvedValue([{ name: "missing", value: null, type: "null" }]);
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("missing")).toBeInTheDocument());
    const cells = screen.getAllByText("null");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("falls back to String(value) for missing type", async () => {
    getSpy.mockResolvedValue([{ name: "untyped", value: 42 }]);
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("untyped")).toBeInTheDocument());
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("truncates a huge JSON value with a suffix and does not crash", async () => {
    const huge = "x".repeat(VALUE_RENDER_BUDGET + 100);
    getSpy.mockResolvedValue([{ name: "big", value: { data: huge }, type: "json" }]);
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("big")).toBeInTheDocument());
    expect(screen.getByText(/… \(truncated; \d+ more chars\)/)).toBeInTheDocument();
  });

  it("Refresh button reloads on click and is disabled while loading", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (v: FlowableVariable[]) => void;
    getSpy.mockReturnValueOnce(
      new Promise<FlowableVariable[]>((res) => {
        resolveFirst = res;
      }),
    );
    render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    const refresh = await screen.findByTestId("variables-refresh");
    expect(refresh).toBeDisabled();
    getSpy.mockResolvedValue([{ name: "amount", value: 1, type: "integer" }]);
    resolveFirst([]);
    await waitFor(() => expect(refresh).toBeEnabled());
    await user.click(refresh);
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  });

  it("renders the row count badge when variables resolve", async () => {
    getSpy.mockResolvedValue([
      { name: "a", value: 1, type: "integer" },
      { name: "b", value: 2, type: "integer" },
    ]);
    const { container } = render(<InstanceVariablesPanel instance={{ id: "pi-1" }} />);
    await waitFor(() => expect(screen.getByText("a")).toBeInTheDocument());
    // The row-count badge is the first `.badge[data-tone="mute"]` in the
    // panel header (before the table body's scope badges).
    const badge = container.querySelector(".panel-hd .badge");
    // Strip the Story 18.2 sr-only prefix ("Count: ") from textContent.
    const visibleText = badge?.textContent?.replace(/^Count:\s*/, "").trim();
    expect(visibleText).toBe("2");
  });
});
