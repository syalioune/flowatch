// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeployDmnModal>.
 *
 * Mirrors `<DeployBpmnModal>`'s suite — same retryable-creation shape,
 * same NCName key validation, same focus-restore via triggerRef. Covers
 * every handler in the modal so the file meets the `src/lib/**`
 * per-file coverage floor.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployDmnModal, type DeployDmnModalTarget } from "../deploy-dmn-modal";

const target: DeployDmnModalTarget = {
  defaultName: "Loan Decisions",
  defaultKey: "Definitions_loan",
  filename: "loan-eligibility.dmn",
};

afterEach(() => cleanup());

describe("<DeployDmnModal>", () => {
  it("renders nothing when target is null", () => {
    render(<DeployDmnModal target={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId("deploy-dmn-modal")).toBeNull();
  });

  it("pre-fills name + id inputs from target.defaultName / defaultKey", () => {
    render(<DeployDmnModal target={target} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const nameInput = screen.getByTestId("deploy-dmn-name") as HTMLInputElement;
    const keyInput = screen.getByTestId("deploy-dmn-key") as HTMLInputElement;
    expect(nameInput.value).toBe("Loan Decisions");
    expect(keyInput.value).toBe("Definitions_loan");
    expect(screen.getByText(target.filename)).toBeInTheDocument();
  });

  it("typing into the name input updates the controlled value (onChange)", () => {
    render(<DeployDmnModal target={target} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const nameInput = screen.getByTestId("deploy-dmn-name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Renamed Decisions" } });
    expect(nameInput.value).toBe("Renamed Decisions");
  });

  it("typing into the id input updates value AND clears a previously shown keyError (onChange)", async () => {
    render(<DeployDmnModal target={target} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const keyInput = screen.getByTestId("deploy-dmn-key") as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("deploy-dmn-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("deploy-dmn-key-error")).toHaveTextContent(/required/),
    );
    fireEvent.change(keyInput, { target: { value: "Definitions_new" } });
    expect(screen.queryByTestId("deploy-dmn-key-error")).toBeNull();
  });

  it("rejects empty id with required-field error; onConfirm not called", async () => {
    const onConfirm = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("deploy-dmn-key"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("deploy-dmn-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("deploy-dmn-key-error")).toHaveTextContent(/required/),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("rejects an id that violates the NCName grammar (e.g. starts with digit)", async () => {
    const onConfirm = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("deploy-dmn-key"), { target: { value: "1bad" } });
    fireEvent.click(screen.getByTestId("deploy-dmn-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("deploy-dmn-key-error")).toHaveTextContent(/letter or underscore/),
    );
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("happy path: clicks Deploy → onConfirm(name, key) → modal closes", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.change(screen.getByTestId("deploy-dmn-name"), {
      target: { value: "  Trimmed Decisions  " },
    });
    fireEvent.change(screen.getByTestId("deploy-dmn-key"), { target: { value: "Definitions_x" } });
    fireEvent.click(screen.getByTestId("deploy-dmn-submit"));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("Trimmed Decisions", "Definitions_x"),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to the id when name is blank", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<DeployDmnModal target={target} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId("deploy-dmn-name"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("deploy-dmn-submit"));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith("Definitions_loan", "Definitions_loan"),
    );
  });

  it("onConfirm throw: renders in-modal ErrorBox, keeps modal open, re-enables submit", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("Engine refused: invalid DMN"));
    const onClose = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("deploy-dmn-submit"));
    await waitFor(() =>
      expect(screen.getByText(/Engine refused: invalid DMN/)).toBeInTheDocument(),
    );
    expect(screen.getByTestId("deploy-dmn-modal")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("deploy-dmn-submit")).toBeEnabled();
  });

  it("Cancel button invokes onClose", () => {
    const onClose = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape key closes the modal (onKey handler)", () => {
    const onClose = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click closes the modal; panel click does not (onClick handlers)", () => {
    const onClose = vi.fn();
    render(<DeployDmnModal target={target} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("deploy-dmn-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    fireEvent.click(screen.getByText("Deploy DMN"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores focus to triggerRef.current on Cancel", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open Deploy";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <DeployDmnModal
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
