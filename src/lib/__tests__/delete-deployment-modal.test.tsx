// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeleteDeploymentModal>.
 *
 * Covers AC-1 through AC-7. Toasts are intercepted via window event
 * listeners on `app:toast` since the modal uses the indirect `toast(...)`
 * dispatch helper from src/components.tsx.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type FlowableDeployment, FlowableError } from "../../api";
import { DeleteDeploymentModal } from "../delete-deployment-modal";

const sampleDeployment: FlowableDeployment = {
  id: "dep-1",
  name: "orders.bpmn",
  deploymentTime: "2026-05-24T12:00:00.000Z",
  tenantId: "",
};

type DeleteFn = (id: string, cascade?: boolean) => Promise<void>;
type DeleteHost = { deleteDeployment: DeleteFn };

const collectToasts = () => {
  const toasts: Array<{ kind?: string; text: string; sub?: string }> = [];
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ kind?: string; text: string; sub?: string }>).detail;
    toasts.push(detail);
  };
  window.addEventListener("app:toast", handler as EventListener);
  return {
    toasts,
    dispose: () => window.removeEventListener("app:toast", handler as EventListener),
  };
};

describe("<DeleteDeploymentModal>", () => {
  const realDelete = api.deleteDeployment;
  let deleteSpy: ReturnType<typeof vi.fn>;
  let toastCollector: ReturnType<typeof collectToasts>;

  beforeEach(() => {
    deleteSpy = vi.fn();
    (api as unknown as DeleteHost).deleteDeployment = deleteSpy as unknown as DeleteFn;
    toastCollector = collectToasts();
  });

  afterEach(() => {
    (api as unknown as DeleteHost).deleteDeployment = realDelete;
    toastCollector.dispose();
    cleanup();
  });

  it("renders nothing when deployment is null", () => {
    render(<DeleteDeploymentModal deployment={null} onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(screen.queryByTestId("delete-deployment-modal")).toBeNull();
  });

  it("renders deployment name + id + cascade-unchecked default", () => {
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={vi.fn()} onSettled={vi.fn()} />,
    );
    expect(screen.getByText("orders.bpmn")).toBeInTheDocument();
    expect(screen.getByText("dep-1")).toBeInTheDocument();
    expect(screen.getByTestId("cascade-checkbox")).not.toBeChecked();
    expect(screen.getByTestId("delete-confirm")).toHaveTextContent("Delete");
  });

  it("renders (no name) when deployment.name is empty", () => {
    render(
      <DeleteDeploymentModal
        deployment={{ ...sampleDeployment, name: "" }}
        onClose={vi.fn()}
        onSettled={vi.fn()}
      />,
    );
    expect(screen.getByText("(no name)")).toBeInTheDocument();
  });

  it("successful delete with cascade=false calls api, emits success toast, settles + closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSettled = vi.fn();
    deleteSpy.mockResolvedValue(undefined);
    render(
      <DeleteDeploymentModal
        deployment={sampleDeployment}
        onClose={onClose}
        onSettled={onSettled}
      />,
    );
    await user.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(deleteSpy).toHaveBeenCalledWith("dep-1", false);
    expect(onSettled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(toastCollector.toasts.at(-1)).toMatchObject({
      kind: "ok",
      text: "Deleted: orders.bpmn",
    });
  });

  it("successful delete with cascade=true sends cascade=true", async () => {
    const user = userEvent.setup();
    deleteSpy.mockResolvedValue(undefined);
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={vi.fn()} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("cascade-checkbox"));
    await user.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(deleteSpy).toHaveBeenCalledWith("dep-1", true);
  });

  it("failure emits err toast with verbatim sub + still settles + closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSettled = vi.fn();
    deleteSpy.mockRejectedValue(
      new FlowableError("Cannot delete deployment with running instances", 409),
    );
    render(
      <DeleteDeploymentModal
        deployment={sampleDeployment}
        onClose={onClose}
        onSettled={onSettled}
      />,
    );
    await user.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(toastCollector.toasts.at(-1)).toMatchObject({
      kind: "err",
      text: "Delete failed",
      sub: "Cannot delete deployment with running instances",
    });
  });

  it("Cancel button closes without calling API", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={onClose} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("delete-cancel"));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape closes the modal", () => {
    const onClose = vi.fn();
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={onClose} onSettled={vi.fn()} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("backdrop click closes; panel click does not", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={onClose} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("delete-deployment-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
    onClose.mockClear();
    await user.click(screen.getByText("Delete deployment"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("busy state disables checkbox + Cancel + Delete; Escape suppressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let resolveDelete!: () => void;
    deleteSpy.mockReturnValue(
      new Promise<void>((res) => {
        resolveDelete = res;
      }),
    );
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={onClose} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("delete-confirm"));
    await waitFor(() =>
      expect(screen.getByTestId("delete-confirm")).toHaveTextContent("Deleting…"),
    );
    expect(screen.getByTestId("cascade-checkbox")).toBeDisabled();
    expect(screen.getByTestId("delete-cancel")).toBeDisabled();
    expect(screen.getByTestId("delete-confirm")).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    resolveDelete();
  });

  it("cascade resets when a new deployment is set", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={vi.fn()} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("cascade-checkbox"));
    expect(screen.getByTestId("cascade-checkbox")).toBeChecked();
    rerender(
      <DeleteDeploymentModal
        deployment={{ ...sampleDeployment, id: "dep-2", name: "other.bpmn" }}
        onClose={vi.fn()}
        onSettled={vi.fn()}
      />,
    );
    expect(screen.getByTestId("cascade-checkbox")).not.toBeChecked();
  });

  // Story 10.2 AC-7 / AC-12 — focus-restore via triggerRef.
  it("restores focus to triggerRef.current after Cancel", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "Open Delete";
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger };
    const focusSpy = vi.spyOn(trigger, "focus");
    render(
      <DeleteDeploymentModal
        deployment={sampleDeployment}
        onClose={vi.fn()}
        onSettled={vi.fn()}
        triggerRef={triggerRef}
      />,
    );
    await user.click(screen.getByTestId("delete-cancel"));
    expect(focusSpy).toHaveBeenCalled();
    document.body.removeChild(trigger);
  });

  it("does not throw when no triggerRef is provided and the modal closes", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <DeleteDeploymentModal deployment={sampleDeployment} onClose={onClose} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("delete-cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
