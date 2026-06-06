// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <AddAttachmentModal> (Story 21.2) — 18th modal in the
 * catalogue. Retryable-creation contract + the project's FIRST inline
 * mode-toggle (Link / File segmented control).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableAttachment, FlowableError } from "../../api";
import { AddAttachmentModal } from "../add-attachment-modal";

describe("<AddAttachmentModal>", () => {
  const realAdd = api.addTaskAttachment;
  let addSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addSpy = vi.fn();
    (api as unknown as { addTaskAttachment: typeof api.addTaskAttachment }).addTaskAttachment =
      addSpy as unknown as typeof api.addTaskAttachment;
  });

  afterEach(() => {
    (api as unknown as { addTaskAttachment: typeof api.addTaskAttachment }).addTaskAttachment =
      realAdd;
    cleanup();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <AddAttachmentModal taskId="task-1" open={false} onClose={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(<AddAttachmentModal taskId="task-1" open onClose={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Add attachment" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "add-attachment-title");
    expect(screen.getByTestId("add-attachment-modal")).toBeInTheDocument();
  });

  it("opens in URL mode by default with the URL input visible", async () => {
    render(<AddAttachmentModal taskId="task-1" open onClose={() => undefined} />);
    await screen.findByText("Add attachment");
    expect(screen.getByTestId("add-attachment-url")).toBeInTheDocument();
    expect(screen.queryByTestId("add-attachment-file")).not.toBeInTheDocument();
    expect(screen.getByTestId("add-attachment-mode-url")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("add-attachment-mode-file")).toHaveAttribute("aria-pressed", "false");
  });

  it("mode toggle swaps inputs and clears mode-specific fields", async () => {
    const user = userEvent.setup();
    render(<AddAttachmentModal taskId="task-1" open onClose={() => undefined} />);
    await screen.findByTestId("add-attachment-url");
    // Fill shared + URL fields.
    await user.type(screen.getByTestId("add-attachment-name"), "thing");
    await user.type(screen.getByTestId("add-attachment-url"), "https://x");
    // Switch to file mode.
    await user.click(screen.getByTestId("add-attachment-mode-file"));
    expect(screen.queryByTestId("add-attachment-url")).not.toBeInTheDocument();
    expect(screen.getByTestId("add-attachment-file")).toBeInTheDocument();
    // Shared name preserved.
    expect((screen.getByTestId("add-attachment-name") as HTMLInputElement).value).toBe("thing");
    // Switch back — externalUrl cleared.
    await user.click(screen.getByTestId("add-attachment-mode-url"));
    expect((screen.getByTestId("add-attachment-url") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("add-attachment-name") as HTMLInputElement).value).toBe("thing");
  });

  it("Save button is disabled until canSubmit", async () => {
    const user = userEvent.setup();
    render(<AddAttachmentModal taskId="task-1" open onClose={() => undefined} />);
    await screen.findByText("Add attachment");
    const submit = screen.getByTestId("add-attachment-submit") as HTMLButtonElement;
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("add-attachment-name"), "n");
    expect(submit).toBeDisabled();
    await user.type(screen.getByTestId("add-attachment-url"), "https://x");
    expect(submit).not.toBeDisabled();
  });

  it("URL submit happy path: calls wrapper with the URL payload + fires onSuccess + onClose", async () => {
    addSpy.mockResolvedValue({ id: "att-1" } satisfies FlowableAttachment);
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<AddAttachmentModal taskId="task-1" open onClose={onClose} onSuccess={onSuccess} />);
    await user.type(screen.getByTestId("add-attachment-name"), "doc");
    await user.type(screen.getByTestId("add-attachment-url"), "https://example.com");
    await user.click(screen.getByTestId("add-attachment-submit"));
    await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1));
    expect(addSpy).toHaveBeenCalledWith("task-1", {
      kind: "url",
      name: "doc",
      externalUrl: "https://example.com",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("File submit happy path: calls wrapper with the file payload + derived type", async () => {
    addSpy.mockResolvedValue({ id: "att-2" } satisfies FlowableAttachment);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <AddAttachmentModal taskId="task-1" open onClose={() => undefined} onSuccess={onSuccess} />,
    );
    await user.click(screen.getByTestId("add-attachment-mode-file"));
    const fileInput = screen.getByTestId("add-attachment-file") as HTMLInputElement;
    const file = new File(["hi"], "report.txt", { type: "text/plain" });
    await user.upload(fileInput, file);
    // Name auto-prefilled from the picked file.
    expect((screen.getByTestId("add-attachment-name") as HTMLInputElement).value).toBe(
      "report.txt",
    );
    await user.click(screen.getByTestId("add-attachment-submit"));
    await waitFor(() => expect(addSpy).toHaveBeenCalledTimes(1));
    const call = addSpy.mock.calls[0] as [
      string,
      { kind: string; name: string; type?: string; file: File },
    ];
    expect(call[0]).toBe("task-1");
    expect(call[1].kind).toBe("file");
    expect(call[1].name).toBe("report.txt");
    expect(call[1].type).toBe("text/plain");
    expect(call[1].file).toBe(file);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("stays open on engine failure, renders ErrorBox, preserves fields", async () => {
    addSpy.mockRejectedValue(new FlowableError("Bad upload", 400));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddAttachmentModal taskId="task-1" open onClose={onClose} />);
    await user.type(screen.getByTestId("add-attachment-name"), "doc");
    await user.type(screen.getByTestId("add-attachment-url"), "https://example.com");
    await user.click(screen.getByTestId("add-attachment-submit"));
    await waitFor(() => expect(screen.getByText("Bad upload")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId("add-attachment-name") as HTMLInputElement).value).toBe("doc");
    expect((screen.getByTestId("add-attachment-url") as HTMLInputElement).value).toBe(
      "https://example.com",
    );
    expect(screen.getByTestId("open-inspector")).toBeInTheDocument();
  });

  it("Cancel restores focus to triggerRef and does not submit", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(<AddAttachmentModal taskId="task-1" open onClose={onClose} triggerRef={triggerRef} />);
    await screen.findByText("Add attachment");
    await user.click(screen.getByTestId("add-attachment-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(addSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AddAttachmentModal taskId="task-1" open onClose={onClose} />);
    await screen.findByText("Add attachment");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the Name input on open", async () => {
    render(<AddAttachmentModal taskId="task-1" open onClose={() => undefined} />);
    const name = await screen.findByTestId("add-attachment-name");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });
});
