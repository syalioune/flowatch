// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeployBpmnModal> (PR #168 follow-up — operator round 4).
 *
 * Covers:
 * - default-value pre-fill from `target.defaultName` / `target.defaultKey`
 * - validation: required key + NCName grammar
 * - retryable-creation pattern: in-modal ErrorBox on `onConfirm` throw,
 *   modal stays open + busy clears
 * - happy path: `onConfirm` called with trimmed values + modal closes
 * - Esc / backdrop close paths
 * - triggerRef focus-restore (Epic 9 retro A-4)
 *
 * Authored as jsdom `.test.tsx` for the `src/lib/**` coverage floor —
 * exercises every function in the modal (onKey, backdrop onClick, both
 * input onChange handlers) to hit the per-file floor.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployBpmnModal, type DeployBpmnModalTarget } from "../deploy-bpmn-modal";

const target: DeployBpmnModalTarget = {
  defaultName: "Loan Approval",
  defaultKey: "loanApproval",
  filename: "loan-approval.bpmn20.xml",
};

afterEach(() => cleanup());

describe("<DeployBpmnModal>", () => {
  it("renders nothing when target is null", () => {
    render(<DeployBpmnModal target={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId("deploy-bpmn-modal")).toBeNull();
  });

  it("pre-fills name + key inputs from target.defaultName / defaultKey", () => {
    render(<DeployBpmnModal target={target} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const nameInput = screen.getByTestId("deploy-bpmn-name") as HTMLInputElement;
    const keyInput = screen.getByTestId("deploy-bpmn-key") as HTMLInputElement;
    expect(nameInput.value).toBe("Loan Approval");
    expect(keyInput.value).toBe("loanApproval");
    expect(screen.getByText(target.filename)).toBeInTheDocument();
  });

  it("typing into the name input updates the controlled value (onChange)", () => {
    render(<DeployBpmnModal target={target} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const nameInput = screen.getByTestId("deploy-bpmn-name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed flow" } });
    expect(nameInput.value).toBe("Renamed flow");
  });

  it("typing into the key input updates value AND clears a previously shown keyError (onChange)", async () => {
    render(<DeployBpmnModal target={target} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const keyInput = screen.getByTestId("deploy-bpmn-key") as HTMLInputElement;
    // Trigger a validation error: blank key.
    fireEvent.change(keyInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("deploy-bpmn-key-error")).toHaveTextContent(/required/),
    );
    // Typing clears the inline error.
    fireEvent.change(keyInput, { target: { value: "newKey" } });
    expect(screen.queryByTestId("deploy-bpmn-key-error")).toBeNull();
  });

  it("rejects empty key with required-field error; onConfirm not called", async () => {
    const onConfirm = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("deploy-bpmn-key"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("deploy-bpmn-key-error")).toHaveTextContent(/required/),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rejects a key that violates the NCName grammar (e.g. starts with digit)", async () => {
    const onConfirm = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("deploy-bpmn-key"), { target: { value: "1bad" } });
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("deploy-bpmn-key-error")).toHaveTextContent(/letter or underscore/),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("happy path: clicks Deploy → onConfirm(name, key) → modal closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("deploy-bpmn-name"), {
      target: { value: "  Trimmed name  " },
    });
    fireEvent.change(screen.getByTestId("deploy-bpmn-key"), { target: { value: "myKey" } });
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("Trimmed name", "myKey"));
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to the key when name is blank", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<DeployBpmnModal target={target} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("deploy-bpmn-name"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("loanApproval", "loanApproval"));
  });

  it("onConfirm throw: renders in-modal ErrorBox, keeps modal open, re-enables submit", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Engine refused: invalid signature"));
    const onClose = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("deploy-bpmn-submit"));
    await waitFor(() =>
      expect(screen.getByText(/Engine refused: invalid signature/)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("deploy-bpmn-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("deploy-bpmn-submit")).toBeEnabled();
  });

  it("Cancel button invokes onClose", () => {
    const onClose = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape key closes the modal (onKey handler)", () => {
    const onClose = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click closes the modal; panel click does not (onClick handlers)", () => {
    const onClose = vi.fn();
    render(<DeployBpmnModal target={target} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("deploy-bpmn-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    fireEvent.click(screen.getByText("Deploy BPMN"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores focus to triggerRef.current on Cancel (Epic 9 retro A-4)", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open Deploy";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <DeployBpmnModal
        target={target}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        triggerRef={triggerRef}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });
});
