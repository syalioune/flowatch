// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <ExecuteDecisionModal> (Story 15.3).
 *
 * Covers the console-shape modal contract — modal stays open on success,
 * input preserved between submits, result panel renders typed output
 * variables parsed from the engine's `resultVariables: Array<Array<...>>`
 * shape, JSON parse errors surface inline, the module-scoped input cache
 * restores per-decision input across opens. The Story 15.3 Matched Rules
 * panel was removed once live-engine probing confirmed Flowable 7.2 never
 * surfaces matched-rule metadata over the REST API.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableDecision, type FlowableDecisionResult, FlowableError } from "../../api";
import {
  __clearInputCache,
  buildFormInputVariables,
  buildInputVariables,
  ExecuteDecisionModal,
  extractOutputVariables,
  parseDecisionInput,
} from "../execute-decision-modal";

type ExecuteFn = typeof api.executeDecision;
type GetXmlFn = typeof api.getDmnDecisionResource;
type ExecuteHost = { executeDecision: ExecuteFn; getDmnDecisionResource: GetXmlFn };

// Minimal DMN XML for the modal's XML fetch + parse pipeline. Two simple
// inputs: a long `creditScore` and a string `employmentStatus`.
const FORM_DMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="D" name="D" namespace="http://x">
  <decision id="formy" name="Formy">
    <decisionTable id="dt" hitPolicy="UNIQUE">
      <input id="i1" label="Credit Score"><inputExpression id="ie1" typeRef="long"><text>creditScore</text></inputExpression></input>
      <input id="i2" label="Employment"><inputExpression id="ie2" typeRef="string"><text>employmentStatus</text></inputExpression></input>
      <output id="o1" name="result" typeRef="string" />
      <rule id="r1"><inputEntry id="r1i1"><text>&gt;= 700</text></inputEntry><inputEntry id="r1i2"><text>"employed"</text></inputEntry><outputEntry id="r1o1"><text>"ok"</text></outputEntry></rule>
    </decisionTable>
  </decision>
</definitions>`;

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
  it("flattens a single result row and preserves the engine-emitted type", () => {
    const out = extractOutputVariables({
      resultVariables: [
        [
          { name: "decision", type: "string", value: "approve" },
          { name: "rate", type: "double", value: 0.0425 },
        ],
      ],
    });
    expect(out).toEqual([
      { name: "decision", type: "string", value: "approve" },
      { name: "rate", type: "double", value: 0.0425 },
    ]);
  });

  it("flattens multiple result rows in order (COLLECT / RULE_ORDER hit-policy shape)", () => {
    const out = extractOutputVariables({
      resultVariables: [
        [{ name: "tier", type: "string", value: "A" }],
        [{ name: "tier", type: "string", value: "B" }],
      ],
    });
    expect(out.map((v) => v.value)).toEqual(["A", "B"]);
  });

  it("returns empty array when resultVariables is missing or empty", () => {
    expect(extractOutputVariables({})).toEqual([]);
    expect(extractOutputVariables({ resultVariables: [] })).toEqual([]);
    expect(extractOutputVariables({ resultVariables: [[]] })).toEqual([]);
  });
});

describe("buildFormInputVariables", () => {
  const inputs = [
    { name: "score", type: "long", label: "Score", isComplex: false, expression: "score" },
    { name: "rate", type: "double", label: "Rate", isComplex: false, expression: "rate" },
    { name: "active", type: "boolean", label: "Active", isComplex: false, expression: "active" },
    { name: "when", type: "date", label: "When", isComplex: false, expression: "when" },
    { name: "tier", type: "string", label: "Tier", isComplex: false, expression: "tier" },
  ];

  it("coerces each field to its DMN type and skips empty values", () => {
    const { variables, errors } = buildFormInputVariables(inputs, {
      score: "750",
      rate: "0.05",
      active: "true",
      when: "2026-05-26",
      tier: "A",
    });
    expect(errors).toEqual([]);
    expect(variables).toEqual([
      { name: "score", type: "long", value: 750 },
      { name: "rate", type: "double", value: 0.05 },
      { name: "active", type: "boolean", value: true },
      { name: "when", type: "date", value: "2026-05-26" },
      { name: "tier", type: "string", value: "A" },
    ]);
  });

  it("OMITS variables whose form value is empty (left blank → not sent)", () => {
    const { variables } = buildFormInputVariables(inputs, { score: "750" });
    expect(variables).toEqual([{ name: "score", type: "long", value: 750 }]);
  });

  it("returns per-field errors for invalid numeric input", () => {
    const { variables, errors } = buildFormInputVariables(inputs, {
      score: "abc",
      rate: "1.5e",
    });
    expect(variables).toEqual([]);
    expect(errors.map((e) => e.name).sort()).toEqual(["rate", "score"]);
  });

  it("rejects a non-integer value for type=long", () => {
    const { errors } = buildFormInputVariables(inputs, { score: "1.5" });
    expect(errors).toContainEqual({ name: "score", message: "Expected an integer." });
  });

  it("uses long for integer values of the generic DMN `number` type, double otherwise", () => {
    const numericInputs = [
      { name: "n", type: "number", label: "N", isComplex: false, expression: "n" },
    ];
    expect(buildFormInputVariables(numericInputs, { n: "5" }).variables[0]?.type).toBe("long");
    expect(buildFormInputVariables(numericInputs, { n: "5.5" }).variables[0]?.type).toBe("double");
  });

  it("skips inputs flagged as complex (FEEL expressions can't be form-bound)", () => {
    const complex = [
      {
        name: "creditScore * 1.1",
        type: "number",
        isComplex: true,
        expression: "creditScore * 1.1",
      },
    ];
    expect(buildFormInputVariables(complex, { "creditScore * 1.1": "100" }).variables).toEqual([]);
  });
});

describe("<ExecuteDecisionModal>", () => {
  const realExec = api.executeDecision;
  const realGetXml = api.getDmnDecisionResource;
  let execSpy: ReturnType<typeof vi.fn>;
  let getXmlSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __clearInputCache();
    execSpy = vi.fn();
    // Default: XML fetch rejects → modal stays in JSON fallback. Tests
    // that need form mode override this stub explicitly.
    getXmlSpy = vi.fn().mockRejectedValue(new Error("no XML stubbed"));
    (api as unknown as ExecuteHost).executeDecision = execSpy as unknown as ExecuteFn;
    (api as unknown as ExecuteHost).getDmnDecisionResource = getXmlSpy as unknown as GetXmlFn;
  });

  afterEach(() => {
    (api as unknown as ExecuteHost).executeDecision = realExec;
    (api as unknown as ExecuteHost).getDmnDecisionResource = realGetXml;
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

  it("successful execute renders the typed output-variables table; modal stays OPEN", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const fakeResult: FlowableDecisionResult = {
      resultVariables: [
        [
          { name: "decision", type: "string", value: "approve" },
          { name: "rate", type: "double", value: 0.0425 },
        ],
      ],
    };
    execSpy.mockResolvedValue(fakeResult);
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={onClose} />);
    await user.click(screen.getByTestId("execute-decision-submit"));
    await waitFor(() => expect(screen.getByTestId("execute-decision-result")).toBeInTheDocument());
    expect(screen.getByTestId("output-variable-decision")).toBeInTheDocument();
    expect(screen.getByTestId("output-variable-rate")).toBeInTheDocument();
    // The engine-emitted type renders as the column badge, not a JS-inferred type.
    expect(screen.getByTestId("output-variable-rate")).toHaveTextContent("double");
    // No matched-rules panel — the engine doesn't surface that data.
    expect(screen.queryByTestId("matched-rule-0")).toBeNull();
    // Modal stays open (console shape).
    expect(screen.getByTestId("execute-decision-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("switches to FORM mode when the XML fetch returns parseable inputs", async () => {
    getXmlSpy.mockResolvedValueOnce(FORM_DMN_XML);
    render(<ExecuteDecisionModal decision={decisionFor("formy")} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("execute-decision-form")).toBeInTheDocument());
    // JSON textarea is gone; the form has one widget per input column.
    expect(screen.queryByTestId("execute-decision-input")).toBeNull();
    expect(screen.getByTestId("execute-decision-input-creditScore")).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByTestId("execute-decision-input-employmentStatus")).toHaveAttribute(
      "type",
      "text",
    );
  });

  it("form-mode submit constructs the typed-variable payload from the form values", async () => {
    getXmlSpy.mockResolvedValueOnce(FORM_DMN_XML);
    execSpy.mockResolvedValue({
      resultVariables: [[{ name: "result", type: "string", value: "ok" }]],
    });
    const user = userEvent.setup();
    render(<ExecuteDecisionModal decision={decisionFor("formy")} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("execute-decision-form")).toBeInTheDocument());

    fireEvent.change(screen.getByTestId("execute-decision-input-creditScore"), {
      target: { value: "750" },
    });
    fireEvent.change(screen.getByTestId("execute-decision-input-employmentStatus"), {
      target: { value: "employed" },
    });
    await user.click(screen.getByTestId("execute-decision-submit"));

    await waitFor(() => expect(execSpy).toHaveBeenCalledTimes(1));
    expect(execSpy).toHaveBeenCalledWith({
      decisionKey: "formy",
      inputVariables: [
        { name: "creditScore", type: "long", value: 750 },
        { name: "employmentStatus", type: "string", value: "employed" },
      ],
    });
    // Result panel still renders (console shape behaviour preserved).
    await waitFor(() => expect(screen.getByTestId("execute-decision-result")).toBeInTheDocument());
  });

  it("form-mode renders per-field error and does NOT submit when coercion fails", async () => {
    getXmlSpy.mockResolvedValueOnce(FORM_DMN_XML);
    const user = userEvent.setup();
    render(<ExecuteDecisionModal decision={decisionFor("formy")} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("execute-decision-form")).toBeInTheDocument());

    // creditScore is typed `long` per the DMN — a fractional value passes
    // the browser-side number-input filter but fails the integer check in
    // buildFormInputVariables, surfacing the per-field error.
    fireEvent.change(screen.getByTestId("execute-decision-input-creditScore"), {
      target: { value: "1.5" },
    });
    await user.click(screen.getByTestId("execute-decision-submit"));
    expect(screen.getByTestId("execute-decision-field-error-creditScore")).toHaveTextContent(
      /integer/i,
    );
    expect(execSpy).not.toHaveBeenCalled();
  });

  it("XML fetch failure falls back to JSON mode (the textarea is rendered)", async () => {
    getXmlSpy.mockRejectedValueOnce(new Error("404"));
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    // The form is never rendered; the JSON textarea is.
    await waitFor(() => expect(screen.getByTestId("execute-decision-input")).toBeInTheDocument());
    expect(screen.queryByTestId("execute-decision-form")).toBeNull();
  });

  it("empty resultVariables renders the 'no output variables' empty state", async () => {
    const user = userEvent.setup();
    execSpy.mockResolvedValue({ resultVariables: [] });
    render(<ExecuteDecisionModal decision={decisionFor("k")} onClose={vi.fn()} />);
    await user.click(screen.getByTestId("execute-decision-submit"));
    await waitFor(() => expect(screen.getByTestId("execute-decision-result")).toBeInTheDocument());
    expect(screen.getByText(/No output variables/i)).toBeInTheDocument();
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
    execSpy.mockResolvedValue({
      resultVariables: [[{ name: "tier", type: "string", value: "A" }]],
    });
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
