// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <EditTaskModal> (Story 21.1) — 17th modal in the catalogue.
 * Mirrors <EditCategoryModal> Story 20.1 retryable-creation contract scaled
 * to a 4-field form with the Story 12.2 datetime-local round-trip.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableTask } from "../../api";
import { EditTaskModal } from "../edit-task-modal";

const TASK: FlowableTask = {
  id: "task-1",
  name: "Approve",
  priority: 50,
  createTime: "2026-01-01T00:00:00.000Z",
  dueDate: "2026-06-01T09:00:00.000Z",
  owner: "owner-a",
  assignee: "user-b",
};

const TASK_NULL_FIELDS: FlowableTask = {
  id: "task-2",
  name: "Review",
  priority: 50,
  createTime: "2026-01-01T00:00:00.000Z",
};

describe("<EditTaskModal>", () => {
  const realUpdate = api.updateTask;
  let updateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updateSpy = vi.fn();
    (api as unknown as { updateTask: typeof api.updateTask }).updateTask =
      updateSpy as unknown as typeof api.updateTask;
  });

  afterEach(() => {
    (api as unknown as { updateTask: typeof api.updateTask }).updateTask = realUpdate;
    cleanup();
  });

  it("renders nothing when task is null", () => {
    const { container } = render(<EditTaskModal task={null} onClose={() => undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with ARIA contract on day one (Epic 18.2)", async () => {
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const dialog = await screen.findByRole("dialog", { name: "Edit task" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "edit-task-title");
    expect(screen.getByTestId("edit-task-modal")).toBeInTheDocument();
  });

  it("prefills all inputs from task fields", async () => {
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const priority = (await screen.findByTestId("edit-task-priority")) as HTMLInputElement;
    expect(priority.value).toBe("50");
    const dueDate = screen.getByTestId("edit-task-due-date") as HTMLInputElement;
    // Local-time round-trip — value matches the toLocalInputValue shape.
    expect(dueDate.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect((screen.getByTestId("edit-task-owner") as HTMLInputElement).value).toBe("owner-a");
    expect((screen.getByTestId("edit-task-assignee") as HTMLInputElement).value).toBe("user-b");
  });

  it("prefills nullable inputs with empty string when task fields are undefined", async () => {
    render(<EditTaskModal task={TASK_NULL_FIELDS} onClose={() => undefined} />);
    await screen.findByTestId("edit-task-priority");
    expect((screen.getByTestId("edit-task-due-date") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("edit-task-owner") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("edit-task-assignee") as HTMLInputElement).value).toBe("");
  });

  it("submits only the diff (single-field change)", async () => {
    updateSpy.mockResolvedValue({ ...TASK, priority: 75 });
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={onClose} onSuccess={onSuccess} />);
    const priority = await screen.findByTestId("edit-task-priority");
    await user.clear(priority);
    await user.type(priority, "75");
    await user.click(screen.getByTestId("edit-task-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("task-1", { priority: 75 });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits null for cleared nullable fields (AC-7)", async () => {
    updateSpy.mockResolvedValue({ ...TASK, owner: undefined, assignee: undefined });
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const owner = await screen.findByTestId("edit-task-owner");
    await user.clear(owner);
    await user.clear(screen.getByTestId("edit-task-assignee"));
    await user.click(screen.getByTestId("edit-task-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("task-1", { owner: null, assignee: null });
  });

  it("submits null when dueDate is cleared (datetime-local empty)", async () => {
    updateSpy.mockResolvedValue({ ...TASK, dueDate: undefined });
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const due = (await screen.findByTestId("edit-task-due-date")) as HTMLInputElement;
    await user.clear(due);
    await user.click(screen.getByTestId("edit-task-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("task-1", { dueDate: null });
  });

  it("submits ISO-8601 UTC for a typed datetime-local value", async () => {
    updateSpy.mockResolvedValue({ ...TASK });
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const due = (await screen.findByTestId("edit-task-due-date")) as HTMLInputElement;
    await user.clear(due);
    // Pin to a deterministic local time; round-trip to UTC ISO.
    await user.type(due, "2026-07-01T10:30");
    await user.click(screen.getByTestId("edit-task-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const [, payload] = updateSpy.mock.calls[0] as [string, { dueDate?: string }];
    expect(typeof payload.dueDate).toBe("string");
    expect(payload.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // The parsed value (local) reinterprets back through Date and produces a UTC string.
    expect(new Date(payload.dueDate ?? "").toISOString()).toBe(payload.dueDate);
  });

  it("submits a multi-field diff when several fields change", async () => {
    updateSpy.mockResolvedValue({ ...TASK });
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const priority = await screen.findByTestId("edit-task-priority");
    await user.clear(priority);
    await user.type(priority, "10");
    const assignee = screen.getByTestId("edit-task-assignee");
    await user.clear(assignee);
    await user.type(assignee, "user-c");
    await user.click(screen.getByTestId("edit-task-submit"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith("task-1", { priority: 10, assignee: "user-c" });
  });

  it("Save is disabled when diff is empty (AC-8 no-op guard)", async () => {
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const submit = (await screen.findByTestId("edit-task-submit")) as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it("shows 'No changes to save' hint only after operator interacts and reverts (AC-8)", async () => {
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    await screen.findByTestId("edit-task-priority");
    // Initially the hint is not visible — pristine === true.
    expect(screen.queryByTestId("edit-task-no-changes")).not.toBeInTheDocument();
    const owner = screen.getByTestId("edit-task-owner");
    await user.type(owner, "z");
    await user.clear(owner);
    await user.type(owner, "owner-a");
    expect(screen.getByTestId("edit-task-no-changes")).toBeInTheDocument();
  });

  it("Save is disabled when Priority is empty (non-nullable AC-7)", async () => {
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const priority = await screen.findByTestId("edit-task-priority");
    await user.clear(priority);
    expect(screen.getByTestId("edit-task-submit") as HTMLButtonElement).toBeDisabled();
  });

  it("stays open on engine failure, renders verbatim ErrorBox, preserves form", async () => {
    updateSpy.mockRejectedValue(new FlowableError("Forbidden", 403));
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={onClose} />);
    const priority = await screen.findByTestId("edit-task-priority");
    await user.clear(priority);
    await user.type(priority, "99");
    await user.click(screen.getByTestId("edit-task-submit"));
    await waitFor(() => expect(screen.getByText("Forbidden")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByTestId("edit-task-priority") as HTMLInputElement).value).toBe("99");
    expect(screen.getByTestId("edit-task-modal")).toBeInTheDocument();
    expect(screen.getByTestId("open-inspector")).toBeInTheDocument();
  });

  it("Cancel closes the modal without submitting + restores focus to triggerRef", async () => {
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "Edit";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={onClose} triggerRef={triggerRef} />);
    await screen.findByText("Edit task");
    await user.click(screen.getByTestId("edit-task-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("Esc closes the modal", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={onClose} />);
    await screen.findByText("Edit task");
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the Priority input on open", async () => {
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const priority = await screen.findByTestId("edit-task-priority");
    await waitFor(() => expect(document.activeElement).toBe(priority));
  });

  it("disables Save while in-flight and shows 'Saving…' text", async () => {
    let resolveUpdate: () => void = () => undefined;
    updateSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    const priority = await screen.findByTestId("edit-task-priority");
    await user.clear(priority);
    await user.type(priority, "75");
    const submit = screen.getByTestId("edit-task-submit") as HTMLButtonElement;
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent(/saving/i);
    resolveUpdate();
  });

  it("shows the read-only task name + id in the modal body", async () => {
    render(<EditTaskModal task={TASK} onClose={() => undefined} />);
    await screen.findByText("Edit task");
    expect(screen.getByText(/Approve/)).toBeInTheDocument();
    expect(screen.getByText(/task-1/)).toBeInTheDocument();
  });
});
