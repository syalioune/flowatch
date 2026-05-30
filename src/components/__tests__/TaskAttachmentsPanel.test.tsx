// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <TaskAttachmentsPanel> (Story 21.2). Mirrors
 * <InstanceVariablesPanel> test harness — Pattern P-002 four-state
 * coverage + panel header affordances.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableAttachment, FlowableError } from "../../api";
import { TaskAttachmentsPanel } from "../TaskAttachmentsPanel";

type ListFn = (taskId: string) => Promise<FlowableAttachment[]>;
type ListHost = { listTaskAttachments: ListFn };

describe("<TaskAttachmentsPanel>", () => {
  const realList = api.listTaskAttachments;
  let listSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listSpy = vi.fn();
    (api as unknown as ListHost).listTaskAttachments = listSpy as unknown as ListFn;
  });

  afterEach(() => {
    (api as unknown as ListHost).listTaskAttachments = realList;
    cleanup();
  });

  it("renders loading skeleton while in-flight", async () => {
    listSpy.mockReturnValue(new Promise(() => undefined));
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await waitFor(() => expect(screen.getByTestId("table-skeleton")).toBeInTheDocument());
  });

  it("renders the EmptyState entry when engine returns an empty array", async () => {
    listSpy.mockResolvedValue([]);
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await waitFor(() =>
      expect(screen.getByText("No attachments on this task.")).toBeInTheDocument(),
    );
    expect(screen.getByText(/declarative pointers/i)).toBeInTheDocument();
  });

  it("renders ErrorBox with retry on engine failure", async () => {
    listSpy.mockRejectedValue(new FlowableError("Boom", 500));
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await waitFor(() => expect(screen.getByTestId("error-box")).toBeInTheDocument());
    expect(screen.getByText("Boom")).toBeInTheDocument();
  });

  it("renders the populated table with Name / Type / Source / Time columns", async () => {
    listSpy.mockResolvedValue([
      {
        id: "att-1",
        name: "design.pdf",
        type: "application/pdf",
        time: "2026-05-31T10:00:00.000Z",
      },
      {
        id: "att-2",
        name: "Dashboard",
        type: "text/html",
        externalUrl: "https://example.com/doc",
        time: "2026-05-31T11:00:00.000Z",
      },
    ]);
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await waitFor(() => expect(screen.getByText("design.pdf")).toBeInTheDocument());
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("application/pdf")).toBeInTheDocument();
    expect(screen.getByText("text/html")).toBeInTheDocument();
    // URL row renders as an anchor; file row renders the mute "File" label.
    const urlAnchor = screen.getByText("https://example.com/doc");
    expect(urlAnchor.closest("a")).toHaveAttribute("href", "https://example.com/doc");
    expect(urlAnchor.closest("a")).toHaveAttribute("target", "_blank");
    expect(urlAnchor.closest("a")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("File")).toBeInTheDocument();
    // Count badge reflects size.
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("refresh button re-fetches the list", async () => {
    listSpy.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));
    await user.click(screen.getByTestId("task-attachments-refresh"));
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
  });

  it("Add attachment button opens the AddAttachmentModal", async () => {
    listSpy.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await user.click(await screen.findByTestId("task-attachments-add"));
    expect(await screen.findByTestId("add-attachment-modal")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "Add attachment" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("renders the panel testid + count-badge sr-only prefix", async () => {
    listSpy.mockResolvedValue([{ id: "att-1", name: "x" }]);
    render(<TaskAttachmentsPanel taskId="task-1" />);
    await waitFor(() => expect(screen.getByTestId("task-attachments-panel")).toBeInTheDocument());
    expect(screen.getByText("Count:", { exact: false })).toBeInTheDocument();
  });
});
