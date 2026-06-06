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

  describe("Story 21.3 — row actions", () => {
    const realContent = api.getTaskAttachmentContent;
    const realDelete = api.deleteTaskAttachment;
    let contentSpy: ReturnType<typeof vi.fn>;
    let deleteSpy: ReturnType<typeof vi.fn>;
    let revokeSpy: ReturnType<typeof vi.fn>;
    let createObjUrlSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      contentSpy = vi.fn();
      deleteSpy = vi.fn();
      (
        api as unknown as { getTaskAttachmentContent: typeof api.getTaskAttachmentContent }
      ).getTaskAttachmentContent = contentSpy as unknown as typeof api.getTaskAttachmentContent;
      (
        api as unknown as { deleteTaskAttachment: typeof api.deleteTaskAttachment }
      ).deleteTaskAttachment = deleteSpy as unknown as typeof api.deleteTaskAttachment;
      createObjUrlSpy = vi.fn(() => "blob:fake");
      revokeSpy = vi.fn();
      Object.defineProperty(URL, "createObjectURL", { value: createObjUrlSpy, configurable: true });
      Object.defineProperty(URL, "revokeObjectURL", { value: revokeSpy, configurable: true });
    });

    afterEach(() => {
      (
        api as unknown as { getTaskAttachmentContent: typeof api.getTaskAttachmentContent }
      ).getTaskAttachmentContent = realContent;
      (
        api as unknown as { deleteTaskAttachment: typeof api.deleteTaskAttachment }
      ).deleteTaskAttachment = realDelete;
    });

    it("each row renders a RowActionMenu with Download/Open link + Delete items", async () => {
      listSpy.mockResolvedValue([
        { id: "att-file", name: "f.txt", type: "text/plain" },
        { id: "att-url", name: "ref", externalUrl: "https://example.com" },
      ]);
      const user = userEvent.setup();
      render(<TaskAttachmentsPanel taskId="task-1" />);
      await waitFor(() => expect(screen.getByText("f.txt")).toBeInTheDocument());
      const triggers = screen.getAllByTestId("row-action-trigger");
      expect(triggers).toHaveLength(2);
      await user.click(triggers[0] as HTMLElement);
      expect(await screen.findByTestId("attachment-download-att-file")).toBeInTheDocument();
      expect(screen.getByTestId("attachment-delete-att-file")).toBeInTheDocument();
      // Label for a file row is "Download".
      expect(screen.getByText("Download")).toBeInTheDocument();
    });

    it("URL row renders 'Open link' label (not 'Download')", async () => {
      listSpy.mockResolvedValue([
        { id: "att-url", name: "ref", externalUrl: "https://example.com" },
      ]);
      const user = userEvent.setup();
      render(<TaskAttachmentsPanel taskId="task-1" />);
      await user.click(await screen.findByTestId("row-action-trigger"));
      expect(await screen.findByText("Open link")).toBeInTheDocument();
    });

    it("File row Download triggers binary fetch + <a download> + revoke", async () => {
      listSpy.mockResolvedValue([{ id: "att-file", name: "f.txt", type: "text/plain" }]);
      const blob = new Blob(["hi"], { type: "text/plain" });
      contentSpy.mockResolvedValue({ blob: () => Promise.resolve(blob) });
      const user = userEvent.setup();
      render(<TaskAttachmentsPanel taskId="task-1" />);
      await user.click(await screen.findByTestId("row-action-trigger"));
      await user.click(await screen.findByTestId("attachment-download-att-file"));
      await waitFor(() => expect(contentSpy).toHaveBeenCalledWith("task-1", "att-file"));
      await waitFor(() => expect(createObjUrlSpy).toHaveBeenCalledWith(blob));
      await waitFor(() => expect(revokeSpy).toHaveBeenCalled());
    });

    it("URL row Open link calls window.open with externalUrl + noopener,noreferrer", async () => {
      listSpy.mockResolvedValue([
        { id: "att-url", name: "ref", externalUrl: "https://example.com" },
      ]);
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      const user = userEvent.setup();
      try {
        render(<TaskAttachmentsPanel taskId="task-1" />);
        await user.click(await screen.findByTestId("row-action-trigger"));
        await user.click(await screen.findByTestId("attachment-download-att-url"));
        expect(openSpy).toHaveBeenCalledWith(
          "https://example.com",
          "_blank",
          "noopener,noreferrer",
        );
        expect(contentSpy).not.toHaveBeenCalled();
      } finally {
        openSpy.mockRestore();
      }
    });

    it("Delete opens the DeleteAttachmentModal (alertdialog)", async () => {
      listSpy.mockResolvedValue([{ id: "att-1", name: "f.txt" }]);
      const user = userEvent.setup();
      render(<TaskAttachmentsPanel taskId="task-1" />);
      await user.click(await screen.findByTestId("row-action-trigger"));
      await user.click(await screen.findByTestId("attachment-delete-att-1"));
      expect(await screen.findByTestId("delete-attachment-modal")).toBeInTheDocument();
      const dialog = screen.getByRole("alertdialog", { name: "Delete attachment?" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("Delete success path: wrapper called + panel reloads via onSettled", async () => {
      listSpy.mockResolvedValueOnce([{ id: "att-1", name: "f.txt" }]);
      listSpy.mockResolvedValueOnce([]);
      deleteSpy.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<TaskAttachmentsPanel taskId="task-1" />);
      await user.click(await screen.findByTestId("row-action-trigger"));
      await user.click(await screen.findByTestId("attachment-delete-att-1"));
      await user.click(await screen.findByTestId("delete-attachment-confirm"));
      await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("task-1", "att-1"));
      // Modal closes on settle.
      await waitFor(() =>
        expect(screen.queryByTestId("delete-attachment-modal")).not.toBeInTheDocument(),
      );
      // Panel reloads (second listTaskAttachments call after the initial mount).
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });

    it("Delete failure path: modal still closes + panel still reloads (engine is source of truth)", async () => {
      listSpy.mockResolvedValueOnce([{ id: "att-1", name: "f.txt" }]);
      listSpy.mockResolvedValueOnce([{ id: "att-1", name: "f.txt" }]);
      deleteSpy.mockRejectedValue(new Error("403 forbidden"));
      const user = userEvent.setup();
      render(<TaskAttachmentsPanel taskId="task-1" />);
      await user.click(await screen.findByTestId("row-action-trigger"));
      await user.click(await screen.findByTestId("attachment-delete-att-1"));
      await user.click(await screen.findByTestId("delete-attachment-confirm"));
      await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(screen.queryByTestId("delete-attachment-modal")).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    });
  });
});
