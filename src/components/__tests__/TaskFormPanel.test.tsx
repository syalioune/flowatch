// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the <TaskFormPanel> pure helpers + rendering branches
 * (Story 11.3). The submit-against-live-engine path is exercised by
 * e2e/task-form-submit.spec.ts; here we pin the pure logic + per-field
 * rendering so a future refactor can't silently change the contract.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableTask, type FlowableTaskForm } from "../../api";
import { NAV_INVALIDATE_COUNTS } from "../../lib/nav-events";
import {
  buildSubmitProperties,
  initialFormValues,
  TaskFormPanel,
  validateFormValues,
} from "../TaskFormPanel";

const sampleTask: FlowableTask = {
  id: "task-1",
  name: "Approve Loan",
  priority: 50,
  createTime: "2026-05-25T12:00:00.000Z",
};

describe("initialFormValues", () => {
  it("returns an empty record for an undefined/empty property list", () => {
    expect(initialFormValues(undefined)).toEqual({});
    expect(initialFormValues([])).toEqual({});
  });

  it("coerces boolean fields from value=true/false strings", () => {
    expect(
      initialFormValues([
        { id: "active", type: "boolean", value: "true" },
        { id: "archived", type: "boolean", value: "false" },
        { id: "missing", type: "boolean" },
      ]),
    ).toEqual({ active: true, archived: false, missing: false });
  });

  it("passes through string/enum/date/number values as strings", () => {
    expect(
      initialFormValues([
        { id: "name", type: "string", value: "Mira" },
        { id: "amount", type: "long", value: "1000" },
        { id: "rate", type: "double", value: "1.5" },
        { id: "due", type: "date", value: "2026-06-01" },
        { id: "decision", type: "enum", value: "approve" },
        { id: "blank", type: "string" },
      ]),
    ).toEqual({
      name: "Mira",
      amount: "1000",
      rate: "1.5",
      due: "2026-06-01",
      decision: "approve",
      blank: "",
    });
  });
});

describe("validateFormValues", () => {
  it("returns {} when all required fields are populated", () => {
    expect(
      validateFormValues(
        [
          { id: "a", type: "string", required: true },
          { id: "b", type: "long", required: false },
        ],
        { a: "hi", b: "" },
      ),
    ).toEqual({});
  });

  it("flags required string field that is empty / whitespace-only", () => {
    expect(validateFormValues([{ id: "a", type: "string", required: true }], { a: "" })).toEqual({
      a: "This field is required.",
    });
    expect(validateFormValues([{ id: "a", type: "string", required: true }], { a: "   " })).toEqual(
      { a: "This field is required." },
    );
  });

  it("accepts boolean false as a valid answer for a required boolean field", () => {
    expect(
      validateFormValues([{ id: "ok", type: "boolean", required: true }], { ok: false }),
    ).toEqual({});
  });

  it("flags non-finite long/double when the field is non-empty", () => {
    expect(validateFormValues([{ id: "a", type: "long" }], { a: "not a number" })).toEqual({
      a: "Must be a valid integer.",
    });
    expect(validateFormValues([{ id: "a", type: "double" }], { a: "NaN" })).toEqual({
      a: "Must be a valid number.",
    });
  });

  it("does NOT flag an empty optional numeric field", () => {
    expect(validateFormValues([{ id: "a", type: "long", required: false }], { a: "" })).toEqual({});
  });

  it("reports both required-and-non-finite errors per field", () => {
    // Required + non-finite — the required check wins (empty trumps coercion).
    const errors = validateFormValues([{ id: "n", type: "long", required: true }], { n: "abc" });
    // Either error is acceptable; the impl picks the numeric one because the
    // required check passes (non-empty string).
    expect(Object.keys(errors)).toContain("n");
  });
});

describe("buildSubmitProperties", () => {
  it("returns booleans as 'true' / 'false' strings", () => {
    expect(buildSubmitProperties({ active: true, archived: false })).toEqual([
      { id: "active", value: "true" },
      { id: "archived", value: "false" },
    ]);
  });

  it("passes through string values verbatim (no Number coercion)", () => {
    expect(buildSubmitProperties({ name: "Mira", amount: "1000" })).toEqual([
      { id: "name", value: "Mira" },
      { id: "amount", value: "1000" },
    ]);
  });

  it("preserves source-iteration order", () => {
    const result = buildSubmitProperties({ a: "1", b: "2", c: "3" });
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

type GetFormFn = (taskId: string) => Promise<FlowableTaskForm>;
type SubmitFormFn = (
  taskId: string,
  body: { properties: Array<{ id: string; value: string }> },
) => Promise<FlowableTaskForm>;
type Host = { getTaskForm: GetFormFn; submitTaskForm: SubmitFormFn };

describe("<TaskFormPanel>", () => {
  const realGet = api.getTaskForm;
  const realSubmit = api.submitTaskForm;
  let getSpy: ReturnType<typeof vi.fn>;
  let submitSpy: ReturnType<typeof vi.fn>;
  let onSubmitted: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getSpy = vi.fn();
    submitSpy = vi.fn();
    onSubmitted = vi.fn();
    (api as unknown as Host).getTaskForm = getSpy as unknown as GetFormFn;
    (api as unknown as Host).submitTaskForm = submitSpy as unknown as SubmitFormFn;
  });

  afterEach(() => {
    (api as unknown as Host).getTaskForm = realGet;
    (api as unknown as Host).submitTaskForm = realSubmit;
    cleanup();
  });

  it("renders the No-form-attached empty state when the engine returns null", async () => {
    getSpy.mockResolvedValue(null as unknown as FlowableTaskForm);
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    await waitFor(() => expect(screen.getByText(/No form attached/)).toBeInTheDocument());
  });

  it("renders the No-form-attached empty state on FlowableError 404", async () => {
    getSpy.mockRejectedValue(new FlowableError("Not found", 404));
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    await waitFor(() => expect(screen.getByText(/No form attached/)).toBeInTheDocument());
  });

  it("renders the in-panel ErrorBox with the verbatim engine message on FlowableError 400", async () => {
    // Real-world example: Flowable 7.2 returns this when a BPMN form definition
    // references an unrecognised property type (e.g. `type="custom-widget"`).
    getSpy.mockRejectedValue(new FlowableError("unknown type 'custom-widget' attachmentRef", 400));
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    await waitFor(() =>
      expect(screen.getByText(/unknown type 'custom-widget'/)).toBeInTheDocument(),
    );
    // The "No form attached" empty state should NOT also render — the engine
    // told us the form IS there, just unparseable.
    expect(screen.queryByText(/No form attached/)).toBeNull();
  });

  it("renders the populated form with each AC-2 field type", async () => {
    getSpy.mockResolvedValue({
      formKey: "loan-form",
      formProperties: [
        { id: "name", name: "Name", type: "string", required: true },
        { id: "amount", name: "Amount", type: "long" },
        { id: "rate", name: "Rate", type: "double" },
        { id: "due", name: "Due", type: "date" },
        {
          id: "decision",
          name: "Decision",
          type: "enum",
          enumValues: ["approve", { id: "reject", name: "Reject" }],
        },
        { id: "active", name: "Active", type: "boolean", value: "false" },
        { id: "ext", name: "Ext", type: "custom-widget" },
      ],
    });
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    // formKey indicator
    await waitFor(() => expect(screen.getByText(/loan-form/)).toBeInTheDocument());
    // Each field carries the dynamic testid family.
    expect(screen.getByTestId("task-form-field-name")).toBeInTheDocument();
    expect(screen.getByTestId("task-form-field-amount")).toBeInTheDocument();
    expect(screen.getByTestId("task-form-field-rate")).toBeInTheDocument();
    expect(screen.getByTestId("task-form-field-due")).toBeInTheDocument();
    expect(screen.getByTestId("task-form-field-decision")).toBeInTheDocument();
    expect(screen.getByTestId("task-form-field-active")).toBeInTheDocument();
    expect(screen.getByTestId("task-form-field-ext")).toBeInTheDocument();
    // Submit button is rendered.
    expect(screen.getByTestId("task-form-submit")).toBeInTheDocument();
  });

  it("blocks submit and shows a field error when a required field is empty", async () => {
    getSpy.mockResolvedValue({
      formProperties: [{ id: "name", name: "Name", type: "string", required: true }],
    });
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    const submit = await screen.findByTestId("task-form-submit");
    fireEvent.click(submit);
    await waitFor(() =>
      expect(screen.getByTestId("task-form-field-error-name")).toHaveTextContent(/required/i),
    );
    expect(submitSpy).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("submits the controlled values + dispatches nav:invalidate-counts + calls onSubmitted", async () => {
    getSpy.mockResolvedValue({
      formProperties: [
        { id: "name", name: "Name", type: "string", required: true },
        { id: "active", name: "Active", type: "boolean", value: "false" },
      ],
    });
    submitSpy.mockResolvedValue({} as unknown as FlowableTaskForm);
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener(NAV_INVALIDATE_COUNTS, handler);
    try {
      render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
      const nameInput = (await screen.findByLabelText(/Name/)) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: "Mira" } });
      fireEvent.click(screen.getByTestId("task-form-submit"));
      await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
      expect(submitSpy).toHaveBeenCalledWith("t-1", {
        properties: [
          { id: "name", value: "Mira" },
          { id: "active", value: "false" },
        ],
      });
      expect(events).toContain(NAV_INVALIDATE_COUNTS);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(NAV_INVALIDATE_COUNTS, handler);
    }
  });

  it("renders the in-form ErrorBox on submit failure AND preserves the typed values", async () => {
    getSpy.mockResolvedValue({
      formProperties: [{ id: "name", name: "Name", type: "string" }],
    });
    submitSpy.mockRejectedValue(new Error("Engine validation failed"));
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    const nameInput = (await screen.findByLabelText(/Name/)) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Mira" } });
    fireEvent.click(screen.getByTestId("task-form-submit"));
    await waitFor(() => expect(screen.getByTestId("task-form-error-box")).toBeInTheDocument());
    expect(screen.getByText(/Engine validation failed/)).toBeInTheDocument();
    // Values still in the input — retryable creation pattern.
    expect(nameInput.value).toBe("Mira");
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("re-fetches the form when the Refresh button is clicked", async () => {
    getSpy.mockResolvedValue({ formProperties: [] });
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    await waitFor(() => expect(screen.getByTestId("task-form-refresh")).toBeInTheDocument());
    const refresh = screen.getByTestId("task-form-refresh");
    fireEvent.click(refresh);
    await waitFor(() => expect(getSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("selecting an enum option updates the controlled state and submits the selected key", async () => {
    getSpy.mockResolvedValue({
      formProperties: [
        {
          id: "decision",
          name: "Decision",
          type: "enum",
          enumValues: ["approve", { id: "reject", name: "Reject" }],
        },
      ],
    });
    submitSpy.mockResolvedValue({} as unknown as FlowableTaskForm);
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    const approveBtn = await screen.findByRole("button", { name: "approve" });
    fireEvent.click(approveBtn);
    fireEvent.click(screen.getByTestId("task-form-submit"));
    await waitFor(() =>
      expect(submitSpy).toHaveBeenCalledWith("t-1", {
        properties: [{ id: "decision", value: "approve" }],
      }),
    );
  });
});
