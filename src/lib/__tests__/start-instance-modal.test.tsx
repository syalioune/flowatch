// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <StartInstanceModal> (Story 10.2).
 *
 * Covers AC-1 (placeholder swap), AC-2 (form fields), AC-3 (JSON parse +
 * object-shape validation), AC-4 (success path: navigate + toast), AC-5
 * (failure path: in-modal ErrorBox, modal stays open), AC-6 (Esc / Cancel /
 * backdrop closes; busy-suppression), AC-7 (triggerRef focus-restore), AC-10
 * (busy state disables form fields + label flips to "Starting…").
 *
 * Authored as jsdom `.test.tsx` for the `src/lib/**` coverage floor.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  api,
  FlowableError,
  type FlowableProcessDefinition,
  type FlowableProcessInstance,
} from "../../api";
import {
  parseVariablesInput,
  StartInstanceModal,
  toFlowableVariables,
} from "../start-instance-modal";

// TanStack Router's useNavigate() expects a RouterContext provider. The tests
// don't need real navigation — stub the hook at the module level so any
// component import resolves to a spy.
const navigateSpy = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateSpy,
}));

const sampleDefinition: FlowableProcessDefinition = {
  id: "loan:1:abcdef",
  key: "loan",
  name: "Loan Approval",
  version: 1,
  deploymentId: "dep-1",
  tenantId: "",
};

type StartFn = (body: Record<string, unknown>) => Promise<FlowableProcessInstance>;
type StartHost = { startProcessInstance: StartFn };

describe("parseVariablesInput", () => {
  it("returns ok:true with value:null for empty input", () => {
    expect(parseVariablesInput("")).toEqual({ ok: true, value: null });
    expect(parseVariablesInput("   ")).toEqual({ ok: true, value: null });
  });

  it("returns ok:true with the parsed object for a valid JSON object", () => {
    const result = parseVariablesInput('{ "amount": 1000 }');
    expect(result).toEqual({ ok: true, value: { amount: 1000 } });
  });

  it("returns ok:false with a parse error for invalid JSON", () => {
    const result = parseVariablesInput("not json");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Variables must be valid JSON/);
    }
  });

  it("returns ok:false when value is a JSON array", () => {
    const result = parseVariablesInput("[1, 2, 3]");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Variables must be a JSON object/);
    }
  });

  it("returns ok:false when value is a JSON primitive (number, string, null)", () => {
    expect(parseVariablesInput("42").ok).toBe(false);
    expect(parseVariablesInput('"hello"').ok).toBe(false);
    expect(parseVariablesInput("null").ok).toBe(false);
  });
});

describe("toFlowableVariables", () => {
  it("converts a flat JSON object to Flowable's name/value array shape", () => {
    expect(toFlowableVariables({ amount: 1000, currency: "EUR" })).toEqual([
      { name: "amount", value: 1000 },
      { name: "currency", value: "EUR" },
    ]);
  });

  it("returns an empty array for an empty object", () => {
    expect(toFlowableVariables({})).toEqual([]);
  });
});

describe("<StartInstanceModal>", () => {
  const realStart = api.startProcessInstance;
  let startSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateSpy.mockClear();
    startSpy = vi.fn();
    (api as unknown as StartHost).startProcessInstance = startSpy as unknown as StartFn;
  });

  afterEach(() => {
    (api as unknown as StartHost).startProcessInstance = realStart;
    cleanup();
  });

  it("renders nothing when definition is null", () => {
    render(<StartInstanceModal definition={null} onClose={vi.fn()} />);
    expect(screen.queryByTestId("start-instance-modal")).toBeNull();
  });

  it("renders three form sections + definition context line + Cancel + Start", () => {
    render(<StartInstanceModal definition={sampleDefinition} onClose={vi.fn()} />);
    expect(screen.getByTestId("start-instance-modal")).toBeInTheDocument();
    expect(screen.getByText(/Definition:/)).toBeInTheDocument();
    expect(screen.getByText(/Loan Approval/)).toBeInTheDocument();
    expect(screen.getByText(/key: loan/)).toBeInTheDocument();
    expect(screen.getByTestId("start-instance-business-key")).toBeInTheDocument();
    expect(screen.getByTestId("start-instance-variables")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByTestId("start-instance-submit")).toBeEnabled();
  });

  it("shows inline JSON parse error when Variables is invalid; does not call API", async () => {
    const user = userEvent.setup();
    render(<StartInstanceModal definition={sampleDefinition} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("start-instance-variables"), {
      target: { value: "not json" },
    });
    await user.click(screen.getByTestId("start-instance-submit"));
    expect(screen.getByTestId("start-instance-variables-error")).toHaveTextContent(
      /must be valid JSON/,
    );
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("shows inline error when Variables is a JSON array; does not call API", async () => {
    const user = userEvent.setup();
    render(<StartInstanceModal definition={sampleDefinition} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("start-instance-variables"), {
      target: { value: "[1,2,3]" },
    });
    await user.click(screen.getByTestId("start-instance-submit"));
    expect(screen.getByTestId("start-instance-variables-error")).toHaveTextContent(
      /must be a JSON object/,
    );
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("clears parse error on Variables onChange", async () => {
    const user = userEvent.setup();
    render(<StartInstanceModal definition={sampleDefinition} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("start-instance-variables"), {
      target: { value: "not json" },
    });
    await user.click(screen.getByTestId("start-instance-submit"));
    expect(screen.getByTestId("start-instance-variables-error")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("start-instance-variables"), {
      target: { value: "not json a" },
    });
    expect(screen.queryByTestId("start-instance-variables-error")).toBeNull();
  });

  it("submits with processDefinitionKey only when both optional fields are empty", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    startSpy.mockResolvedValue({
      id: "pi-1",
      processDefinitionId: sampleDefinition.id,
      processDefinitionKey: "loan",
      startTime: "now",
    } satisfies FlowableProcessInstance);
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByTestId("start-instance-submit"));
    await waitFor(() => expect(startSpy).toHaveBeenCalled());
    expect(startSpy).toHaveBeenCalledWith({ processDefinitionKey: "loan" });
  });

  it("submits with businessKey + variables array when provided", async () => {
    const user = userEvent.setup();
    startSpy.mockResolvedValue({
      id: "pi-2",
      processDefinitionId: sampleDefinition.id,
      processDefinitionKey: "loan",
      startTime: "now",
    } satisfies FlowableProcessInstance);
    render(<StartInstanceModal definition={sampleDefinition} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("start-instance-business-key"), {
      target: { value: "order-42" },
    });
    fireEvent.change(screen.getByTestId("start-instance-variables"), {
      target: { value: '{"amount":1000}' },
    });
    await user.click(screen.getByTestId("start-instance-submit"));
    await waitFor(() => expect(startSpy).toHaveBeenCalled());
    expect(startSpy).toHaveBeenCalledWith({
      processDefinitionKey: "loan",
      businessKey: "order-42",
      variables: [{ name: "amount", value: 1000 }],
    });
  });

  it("on success: closes modal and navigates to /instances/$id with the new id", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    startSpy.mockResolvedValue({
      id: "pi-success",
      processDefinitionId: sampleDefinition.id,
      processDefinitionKey: "loan",
      startTime: "now",
    } satisfies FlowableProcessInstance);
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByTestId("start-instance-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/instances/$id",
      params: { id: "pi-success" },
    });
  });

  it("on failure: renders ErrorBox in-modal and keeps the modal open", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    startSpy.mockRejectedValue(new FlowableError("Cannot start: definition suspended", 409));
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByTestId("start-instance-submit"));
    await waitFor(() => expect(screen.getByTestId("error-box")).toHaveTextContent("Cannot start"));
    expect(screen.getByTestId("start-instance-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    // Start button re-enables.
    expect(screen.getByTestId("start-instance-submit")).toBeEnabled();
  });

  it("Cancel button invokes onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click closes the modal; panel click does not", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByTestId("start-instance-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    await user.click(screen.getByText("Start process instance"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("busy state disables form fields and changes the button label to Starting…", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveStart!: (v: FlowableProcessInstance) => void;
    startSpy.mockReturnValue(
      new Promise<FlowableProcessInstance>((res) => {
        resolveStart = res;
      }),
    );
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByTestId("start-instance-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("start-instance-submit")).toHaveTextContent("Starting…"),
    );
    expect(screen.getByTestId("start-instance-business-key")).toBeDisabled();
    expect(screen.getByTestId("start-instance-variables")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    // Resolve so the test doesn't dangle.
    resolveStart({
      id: "pi-dangling",
      processDefinitionId: sampleDefinition.id,
      processDefinitionKey: "loan",
      startTime: "now",
    });
  });

  it("restores focus to triggerRef.current after Cancel (AC-7)", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Open Start";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <StartInstanceModal
        definition={sampleDefinition}
        onClose={vi.fn()}
        triggerRef={triggerRef}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });

  it("does not throw when no triggerRef is provided and the modal closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<StartInstanceModal definition={sampleDefinition} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});
