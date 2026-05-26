// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <ExecuteDecisionModal> (Story 15.3).
 *
 * Covers the console-shape modal contract — modal stays open on success,
 * input preserved between submits, result panel renders matched-rules +
 * output variables, JSON parse errors surface inline, the module-scoped
 * input cache restores per-decision input across opens.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableDecision, type FlowableDecisionResult, FlowableError } from "../../api";
import {
  __clearInputCache,
  buildInputVariables,
  ExecuteDecisionModal,
  extractOutputVariables,
  parseDecisionInput,
} from "../execute-decision-modal";

type ExecuteFn = typeof api.executeDecision;
type ExecuteHost = { executeDecision: ExecuteFn };

const decisionFor = (key: string): FlowableDecision => ({
  id: `dec-${key}`,
  key,
  name: `Decision ${key}`,
  version: 1,
  deploymentId: "dep-1",
});

describe("parseDecisionInput", () => {
  it("empty string parses to an empty object", () => {
    expect(parseDecisionInput("")).toEqual({ ok: true, value: {} });
  });

  it("valid JSON object parses successfully", () => {
    expect(parseDecisionInput('{"a": 1}')).toEqual({ ok: true, value: { a: 1 } });
  });

  it("malformed JSON returns a parse error", () => {
    const out = parseDecisionInput("{ malformed");
    expect(out.ok).toBe(false);
  });

  it("array JSON returns a non-object error", () => {
    expect(parseDecisionInput("[1, 2, 3]")).toMatchObject({ ok: false });
  });

  it("string JSON returns a non-object error", () => {
    expect(parseDecisionInput('"hello"')).toMatchObject({ ok: false });
  });
});

describe("buildInputVariables", () => {
  it("infers types per JS primitive", () => {
    expect(buildInputVariables({ s: "x", n: 1.5, i: 42, b: true })).toEqual([
      { name: "s", type: "string", value: "x" },
      { name: "n", type: "double", value: 1.5 },
      { name: "i", type: "long", value: 42 },
      { name: "b", type: "boolean", value: true },
    ]);
  });

  it("emits json type for objects", () => {
    expect(buildInputVariables({ o: { nested: 1 } })).toEqual([
      { name: "o", type: "json", value: { nested: 1 } },
    ]);
  });
});

describe("extractOutputVariables", () => {
  it("prefers resultVariableMap when present", () => {
    const out = extractOutputVariables({ resultVariableMap: { tier: "A" } });
    expect(out).toEqual([{ name: "tier", type: "string", value: "A" }]);
  });

  it("falls back to legacy resultVariables", () => {
    const out = extractOutputVariables({ resultVariables: { tier: "B" } });
    expect(out).toEqual([{ name: "tier", type: "string", value: "B" }]);
  });

  it("returns empty array when no variables present", () => {
    expect(extractOutputVariables({})).toEqual([]);
  });
});

describe("<ExecuteDecisionModal>", () => {
  const realExec = api.executeDecision;
  let execSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearInputCache();
    execSpy = vi.fn();
    (api as unknown as ExecuteHost).executeDecision = execSpy as unknown as ExecuteFn;
  });

  afterEach(() => {
    (api as unknown as ExecuteHost).executeDecision = realExec;
    cleanup();
  });

  it("renders nothing when decision is null", () => {
    render(<ExecuteDecisionModal decision={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("execute-decision-modal")).toBeNull();
  });

  it("renders the modal with input + Execute/Reset/Close buttons; no result panel before first execute", () => {
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    expect(screen.getByTestId("execute-decision-modal")).toBeInTheDocument();
    expect(screen.getByTestId("execute-decision-input")).toBeInTheDocument();
    expect(screen.getByTestId("execute-decision-submit")).toBeInTheDocument();
    expect(screen.getByTestId("execute-decision-reset")).toBeInTheDocument();
    expect(screen.queryByTestId("execute-decision-result")).toBeNull();
  });

  it("invalid JSON renders inline parse error and does NOT submit", async () => {
    const user = userEvent.setup();
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    const input = screen.getByTestId("execute-decision-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "{ invalid" } });
    await user.click(screen.getByTestId("execute-decision-submit"));
    expect(screen.getByTestId("json-parse-error")).toBeInTheDocument();
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("array input renders non-object parse error and does NOT submit", async () => {
    const user = userEvent.setup();
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    const input = screen.getByTestId("execute-decision-input") as HTMLTextAreaElement;
    await user.clear(input);
    // Use fireEvent because userEvent's type() interprets [ as a keyboard sequence
    fireEvent.change(input, { target: { value: "[1, 2]" } });
    await user.click(screen.getByTestId("execute-decision-submit"));
    expect(screen.getByTestId("json-parse-error")).toBeInTheDocument();
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("successful execute renders matched-rules + output-variables; modal stays OPEN", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const fakeResult: FlowableDecisionResult = {
      matchedRules: [{ ruleId: "rule-1", description: "first" }],
      resultVariableMap: { tier: "A", approved: true },
    };
    execSpy.mockResolvedValue(fakeResult);
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={onClose} />);
    await user.click(screen.getByTestId("execute-decision-submit"));
    await waitFor(() => expect(screen.getByTestId("execute-decision-result")).toBeInTheDocument());
    expect(screen.getByTestId("matched-rule-0")).toBeInTheDocument();
    expect(screen.getByTestId("output-variable-tier")).toBeInTheDocument();
    expect(screen.getByTestId("output-variable-approved")).toBeInTheDocument();
    // Modal stays open (console shape).
    expect(screen.getByTestId("execute-decision-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("execute error renders in-modal ErrorBox and hides result panel", async () => {
    const user = userEvent.setup();
    execSpy.mockRejectedValueOnce(new FlowableError("Decision not found", 404));
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("execute-decision-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("error-box")).toHaveTextContent("Decision not found"),
    );
    expect(screen.queryByTestId("execute-decision-result")).toBeNull();
    expect(screen.getByTestId("execute-decision-modal")).toBeInTheDocument();
  });

  it("Reset clears input and hides the result panel", async () => {
    const user = userEvent.setup();
    execSpy.mockResolvedValue({ resultVariableMap: { tier: "A" } });
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    const input = screen.getByTestId("execute-decision-input") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '{"x": 1}' } });
    await user.click(screen.getByTestId("execute-decision-submit"));
    await waitFor(() => expect(screen.getByTestId("execute-decision-result")).toBeInTheDocument());
    await user.click(screen.getByTestId("execute-decision-reset"));
    expect(input.value).toBe("{}");
    expect(screen.queryByTestId("execute-decision-result")).toBeNull();
  });

  it("Close calls onClose and restores focus to triggerRef", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    const onClose = vi.fn();
    render(
      <ExecuteDecisionModal
        decision={decisionFor("k")}
        onClose={onClose}
        triggerRef={triggerRef}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });

  it("per-key input cache restores prior input for the same decision key", async () => {
    const onClose1 = vi.fn();
    const { unmount } = render(
      <ExecuteDecisionModal decision={decisionFor("k1")} onClose={onClose1} />,
    );
    const input1 = screen.getByTestId("execute-decision-input") as HTMLTextAreaElement;
    fireEvent.change(input1, { target: { value: '{"x": 42}' } });
    // Confirm the cache picked up the edit
    expect(input1.value).toBe('{"x": 42}');
    unmount();
    cleanup();
    // Re-mount for the SAME decision key — input restores.
    render(<ExecuteDecisionModal decision={decisionFor("k1")} onClose={vi.fn()} />);
    const input2 = screen.getByTestId("execute-decision-input") as HTMLTextAreaElement;
    await waitFor(() => expect(input2.value).toBe('{"x": 42}'));
    cleanup();
    // Mount for a DIFFERENT decision key — input defaults to `{}`.
    render(<ExecuteDecisionModal decision={decisionFor("k2")} onClose={vi.fn()} />);
    const input3 = screen.getByTestId("execute-decision-input") as HTMLTextAreaElement;
    await waitFor(() => expect(input3.value).toBe("{}"));
  });
});
