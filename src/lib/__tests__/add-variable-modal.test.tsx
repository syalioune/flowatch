// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <AddVariableModal> (Story 19.2).
 *
 * Covers the retryable-creation contract — submit reuses
 * api.updateInstanceVariables (PUT upsert), close on success, stay open on
 * failure, in-modal ErrorBox, form preservation, duplicate-name warning,
 * ARIA on day one (Epic 18.2 codification).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import { AddVariableModal } from "../add-variable-modal";

describe("<AddVariableModal>", () => {
  const realUpdate = api.updateInstanceVariables;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSpy = vi.fn();
    (
      api as unknown as { updateInstanceVariables: typeof api.updateInstanceVariables }
    ).updateInstanceVariables = updateSpy as unknown as typeof api.updateInstanceVariables;
  });

  afterEach(() => {
    (
      api as unknown as { updateInstanceVariables: typeof api.updateInstanceVariables }
    ).updateInstanceVariables = realUpdate;
    cleanup();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(
      <AddVariableModal
        open={false}
        instanceId="pi-1"
        existingNames={[]}
        onClose={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={() => undefined}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: "Add variable" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "add-variable-title");
  });

  it("disables Add until a name is typed", async () => {
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={() => undefined}
      />,
    );
    const submit = await screen.findByTestId("add-variable-submit");
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("add-variable-name"), "tier");
    expect(submit).toBeEnabled();
  });

  it("fires duplicate-name warning when name collides with existingNames", async () => {
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={["amount", "currency"]}
        onClose={() => undefined}
      />,
    );
    const nameInput = await screen.findByTestId("add-variable-name");
    await user.type(nameInput, "tier");
    expect(screen.queryByTestId("add-variable-duplicate-warning")).toBeNull();
    await user.clear(nameInput);
    await user.type(nameInput, "amount");
    expect(screen.getByTestId("add-variable-duplicate-warning")).toBeInTheDocument();
  });

  it("submits the array body and closes on success (retryable-creation contract)", async () => {
    updateSpy.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );
    await user.type(screen.getByTestId("add-variable-name"), "tier");
    await user.type(screen.getByTestId("add-variable-value"), "gold");
    await user.click(screen.getByTestId("add-variable-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("pi-1", [
      { name: "tier", value: "gold", type: "string" },
    ]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open on engine failure + renders verbatim ErrorBox + preserves form", async () => {
    updateSpy.mockRejectedValue(new FlowableError("Bad request: name is empty", 400));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddVariableModal open={true} instanceId="pi-1" existingNames={[]} onClose={onClose} />);
    await user.type(screen.getByTestId("add-variable-name"), "tier");
    await user.type(screen.getByTestId("add-variable-value"), "gold");
    await user.click(screen.getByTestId("add-variable-submit"));
    await waitFor(() => expect(screen.getByText("Bad request: name is empty")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    // Form values preserved across failed submit.
    expect(screen.getByTestId("add-variable-name")).toHaveValue("tier");
    expect(screen.getByTestId("add-variable-value")).toHaveValue("gold");
  });

  it("Cancel closes the modal without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={onClose}
        triggerRef={triggerRef}
      />,
    );
    await screen.findByRole("dialog", { name: "Add variable" });
    await user.click(screen.getByTestId("add-variable-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("renders an <input> (not <textarea>) for scalar types and edits the value", async () => {
    updateSpy.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={() => undefined}
      />,
    );
    await user.type(await screen.findByTestId("add-variable-name"), "count");
    await user.selectOptions(screen.getByTestId("add-variable-type"), "integer");
    const valueField = screen.getByTestId("add-variable-value");
    expect(valueField.tagName).toBe("INPUT");
    await user.type(valueField, "42");
    await user.click(screen.getByTestId("add-variable-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0]?.[1]?.[0]?.value).toBe(42);
  });

  it("toggling scope to local sends scope:'local' in the submit body", async () => {
    updateSpy.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={() => undefined}
      />,
    );
    await user.type(await screen.findByTestId("add-variable-name"), "tier");
    await user.click(screen.getByLabelText("local"));
    await user.click(screen.getByTestId("add-variable-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0]?.[1]?.[0]).toMatchObject({ scope: "local" });
  });

  it("clicking the backdrop closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddVariableModal open={true} instanceId="pi-1" existingNames={[]} onClose={onClose} />);
    const backdrop = await screen.findByTestId("add-variable-modal");
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("name is trimmed before submit (whitespace doesn't bypass disabled state)", async () => {
    updateSpy.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <AddVariableModal
        open={true}
        instanceId="pi-1"
        existingNames={[]}
        onClose={() => undefined}
      />,
    );
    const submit = await screen.findByTestId("add-variable-submit");
    await user.type(screen.getByTestId("add-variable-name"), "   ");
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("add-variable-name"), "tier   ");
    await user.click(submit);
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(updateSpy.mock.calls[0]?.[1]?.[0]?.name).toBe("tier");
  });
});
