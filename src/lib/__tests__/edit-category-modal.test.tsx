// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <EditCategoryModal> (Story 20.1) — 16th modal in the
 * catalogue. Mirrors the <EditVariableModal> (Story 19.1) test shape:
 * retryable-creation contract (close-on-success, stay-open-on-error),
 * triggerRef focus-restore, ARIA on day one (Epic 18.2 codification).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableProcessDefinition } from "../../api";
import { EditCategoryModal } from "../edit-category-modal";

const DEF: FlowableProcessDefinition = {
  id: "def-1",
  key: "loanApproval",
  name: "Loan approval",
  version: 1,
  deploymentId: "dep-1",
  category: "finance",
};

const DEF_NO_CATEGORY: FlowableProcessDefinition = {
  id: "def-2",
  key: "blank",
  name: "Blank",
  version: 1,
  deploymentId: "dep-2",
};

describe("<EditCategoryModal>", () => {
  const realUpdate = api.updateProcessDefinition;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSpy = vi.fn();
    (
      api as unknown as { updateProcessDefinition: typeof api.updateProcessDefinition }
    ).updateProcessDefinition = updateSpy as unknown as typeof api.updateProcessDefinition;
  });

  afterEach(() => {
    (
      api as unknown as { updateProcessDefinition: typeof api.updateProcessDefinition }
    ).updateProcessDefinition = realUpdate;
    cleanup();
  });

  it("renders nothing when definition is null", () => {
    const { container } = render(<EditCategoryModal definition={null} onClose={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(<EditCategoryModal definition={DEF} onClose={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Edit category" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "edit-category-title");
    expect(screen.getByTestId("edit-category-modal")).toBeInTheDocument();
  });

  it("prefills the input from definition.category", async () => {
    render(<EditCategoryModal definition={DEF} onClose={() => undefined} />);
    const input = (await screen.findByTestId("edit-category-input")) as HTMLInputElement;
    expect(input.value).toBe("finance");
  });

  it("prefills the input with empty string when definition.category is undefined", async () => {
    render(<EditCategoryModal definition={DEF_NO_CATEGORY} onClose={() => undefined} />);
    const input = (await screen.findByTestId("edit-category-input")) as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("submits the field object and closes on success (retryable-creation contract)", async () => {
    updateSpy.mockResolvedValue({ ...DEF, category: "accounting" });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditCategoryModal definition={DEF} onClose={onClose} onSuccess={onSuccess} />);
    const input = await screen.findByTestId("edit-category-input");
    await user.clear(input);
    await user.type(input, "accounting");
    await user.click(screen.getByTestId("edit-category-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("def-1", { category: "accounting" });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits empty-string body when the operator clears the input (AC-7)", async () => {
    updateSpy.mockResolvedValue({ ...DEF, category: undefined });
    const user = userEvent.setup();
    render(<EditCategoryModal definition={DEF} onClose={() => undefined} />);
    const input = await screen.findByTestId("edit-category-input");
    await user.clear(input);
    await user.click(screen.getByTestId("edit-category-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("def-1", { category: "" });
  });

  it("stays open on engine failure + renders verbatim ErrorBox + preserves form", async () => {
    updateSpy.mockRejectedValue(new FlowableError("Definition not found", 404));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditCategoryModal definition={DEF} onClose={onClose} />);
    const input = await screen.findByTestId("edit-category-input");
    await user.clear(input);
    await user.type(input, "audit-probe");
    await user.click(screen.getByTestId("edit-category-submit"));
    await waitFor(() => expect(screen.getByText("Definition not found")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    // Form value preserved across the failed submit (operator can retry).
    expect((screen.getByTestId("edit-category-input") as HTMLInputElement).value).toBe(
      "audit-probe",
    );
    expect(screen.getByTestId("edit-category-modal")).toBeInTheDocument();
    // ErrorBox ships the Story 8.2 open-inspector wiring (inherited via the
    // shared <ErrorBox> component); assert presence so a future ErrorBox
    // refactor doesn't silently break this AC-6 contract for the modal.
    expect(screen.getByTestId("open-inspector")).toBeInTheDocument();
  });

  it("Cancel closes the modal without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Edit";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(<EditCategoryModal definition={DEF} onClose={onClose} triggerRef={triggerRef} />);
    await screen.findByText("Edit category");
    await user.click(screen.getByTestId("edit-category-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditCategoryModal definition={DEF} onClose={onClose} />);
    await screen.findByText("Edit category");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Save button while in-flight (busy state)", async () => {
    let resolveUpdate: () => void = () => undefined;
    updateSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<EditCategoryModal definition={DEF} onClose={() => undefined} />);
    await screen.findByText("Edit category");
    const submit = screen.getByTestId("edit-category-submit") as HTMLButtonElement;
    expect(submit).not.toBeDisabled();
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent(/saving/i);
    resolveUpdate();
  });

  it("focuses the input on open (AC-3 — primary affordance lands focus)", async () => {
    render(<EditCategoryModal definition={DEF} onClose={() => undefined} />);
    const input = await screen.findByTestId("edit-category-input");
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("shows the read-only definition name + key in the modal body", async () => {
    render(<EditCategoryModal definition={DEF} onClose={() => undefined} />);
    await screen.findByText("Edit category");
    // Read-only context shows both name and key so the operator sees which
    // definition they're editing even when scrolled away from the page title.
    expect(screen.getByText(/Loan approval/)).toBeInTheDocument();
    expect(screen.getByText(/loanApproval/)).toBeInTheDocument();
  });
});
