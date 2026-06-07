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
  classifyTaskForm,
  initialFormValues,
  mapFormJsData,
  TaskFormPanel,
  validateFormValues,
} from "../TaskFormPanel";

// AC-6: mock the vanilla form-js `Form` class so the component test doesn't
// depend on a real DOM form-js render. The mock records `on("submit")`
// handlers and replays them from `submit()` (matching the real Form#submit
// which emits the "submit" event synchronously); `formMock.{data,errors}`
// let each test drive the emitted payload.
const formMock = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  errors: {} as Record<string, unknown>,
  importRejects: null as Error | null,
}));
vi.mock("@bpmn-io/form-js-viewer", () => {
  class MockForm {
    private handlers: Record<string, Array<(e: unknown) => void>> = {};
    on(type: string, h: (e: unknown) => void) {
      this.handlers[type] = this.handlers[type] ?? [];
      this.handlers[type].push(h);
    }
    off(type: string, h: (e: unknown) => void) {
      this.handlers[type] = (this.handlers[type] ?? []).filter((x) => x !== h);
    }
    importSchema() {
      return formMock.importRejects ? Promise.reject(formMock.importRejects) : Promise.resolve({});
    }
    submit() {
      const result = { data: formMock.data, errors: formMock.errors, files: new Map() };
      for (const h of this.handlers.submit ?? []) h(result);
      return result;
    }
    destroy() {}
  }
  return { Form: MockForm };
});

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

describe("classifyTaskForm (Story 29.1)", () => {
  it("returns 'form-js' when the payload carries a NON-EMPTY components array", () => {
    expect(classifyTaskForm({ components: [{ type: "textfield", key: "name" }] })).toBe("form-js");
  });

  it("returns 'legacy' when the payload carries a NON-EMPTY formProperties array (no components)", () => {
    expect(classifyTaskForm({ formProperties: [{ id: "a", type: "string" }] })).toBe("legacy");
  });

  it("prefers form-js when BOTH populated arrays are present", () => {
    expect(
      classifyTaskForm({
        components: [{ type: "textfield", key: "n" }],
        formProperties: [{ id: "a", type: "string" }],
      }),
    ).toBe("form-js");
  });

  it("returns 'none' for EMPTY arrays (live engine sends formProperties:[] for no-form tasks)", () => {
    expect(classifyTaskForm({ components: [] })).toBe("none");
    expect(classifyTaskForm({ formProperties: [] })).toBe("none");
    expect(classifyTaskForm({ formKey: "x", formProperties: [] })).toBe("none");
  });

  it("returns 'none' for null / undefined / a no-array payload", () => {
    expect(classifyTaskForm(null)).toBe("none");
    expect(classifyTaskForm(undefined)).toBe("none");
    expect(classifyTaskForm({ formKey: "x" })).toBe("none");
  });
});

describe("mapFormJsData (Story 29.1)", () => {
  it("maps a form-js data object to the { id, value } envelope, stringifying values", () => {
    expect(mapFormJsData({ name: "Mira", amount: 1000, active: true, archived: false })).toEqual([
      { id: "name", value: "Mira" },
      { id: "amount", value: "1000" },
      { id: "active", value: "true" },
      { id: "archived", value: "false" },
    ]);
  });

  it("returns an empty array for an empty data object", () => {
    expect(mapFormJsData({})).toEqual([]);
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
    formMock.data = {};
    formMock.errors = {};
    formMock.importRejects = null;
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

  // ─── Story 29.1: form-js branch ─────────────────────────────────────
  const fjsPayload: FlowableTaskForm = {
    formKey: "loan-fjs",
    components: [{ type: "textfield", key: "name", label: "Name" }],
  };

  it("mounts the form-js branch for a components payload (legacy field rows absent)", async () => {
    getSpy.mockResolvedValue(fjsPayload);
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    await waitFor(() => expect(screen.getByTestId("task-form-js-viewer")).toBeInTheDocument());
    // form-js submit button present; legacy field rows + legacy submit absent.
    expect(screen.getByTestId("task-form-js-submit")).toBeInTheDocument();
    expect(screen.queryByTestId("task-form-field-name")).toBeNull();
    expect(screen.queryByTestId("task-form-submit")).toBeNull();
  });

  it("form-js submit maps data → { properties } via submitTaskForm + dispatches nav + onSubmitted", async () => {
    getSpy.mockResolvedValue(fjsPayload);
    submitSpy.mockResolvedValue({} as unknown as FlowableTaskForm);
    formMock.data = { name: "Mira", active: true };
    const events: string[] = [];
    const handler = (e: Event) => events.push(e.type);
    window.addEventListener(NAV_INVALIDATE_COUNTS, handler);
    try {
      render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
      // The submit button is enabled only after importSchema resolves (ready).
      const submit = await screen.findByTestId("task-form-js-submit");
      await waitFor(() => expect(submit).not.toBeDisabled());
      fireEvent.click(submit);
      await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
      expect(submitSpy).toHaveBeenCalledWith("t-1", {
        properties: [
          { id: "name", value: "Mira" },
          { id: "active", value: "true" },
        ],
      });
      expect(events).toContain(NAV_INVALIDATE_COUNTS);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(NAV_INVALIDATE_COUNTS, handler);
    }
  });

  it("form-js client-side validation errors block submit", async () => {
    getSpy.mockResolvedValue(fjsPayload);
    submitSpy.mockResolvedValue({} as unknown as FlowableTaskForm);
    formMock.errors = { name: ["Field is required."] };
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    const submit = await screen.findByTestId("task-form-js-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    // Errors non-empty → handler returns early; no wire call, no navigation.
    await new Promise((r) => setTimeout(r, 0));
    expect(submitSpy).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("renders an ErrorBox (not a blank panel) when importSchema rejects", async () => {
    getSpy.mockResolvedValue(fjsPayload);
    formMock.importRejects = new Error("malformed form-js schema");
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    await waitFor(() =>
      expect(screen.getByTestId("task-form-js-import-error")).toBeInTheDocument(),
    );
    expect(screen.getByText(/malformed form-js schema/)).toBeInTheDocument();
    // Submit stays disabled when the import failed.
    expect(screen.getByTestId("task-form-js-submit")).toBeDisabled();
  });

  it("form-js submit failure renders an in-panel ErrorBox (retryable)", async () => {
    getSpy.mockResolvedValue(fjsPayload);
    submitSpy.mockRejectedValue(new Error("Engine rejected the form"));
    formMock.data = { name: "Mira" };
    render(<TaskFormPanel taskId="t-1" task={sampleTask} onSubmitted={onSubmitted} />);
    const submit = await screen.findByTestId("task-form-js-submit");
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByTestId("task-form-error-box")).toBeInTheDocument());
    expect(screen.getByText(/Engine rejected the form/)).toBeInTheDocument();
    expect(onSubmitted).not.toHaveBeenCalled();
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
