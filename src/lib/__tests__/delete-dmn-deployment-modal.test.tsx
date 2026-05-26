// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeleteDmnDeploymentModal> (Story 15.2).
 *
 * Mirrors the BPMN precedent at delete-deployment-modal.test.tsx with the
 * DMN wrapper (`api.removeDmnDeployment`) and the one-shot destructive
 * shape (modal closes regardless of success/failure; toast carries the
 * outcome).
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError } from "../../api";
import { DeleteDmnDeploymentModal } from "../delete-dmn-deployment-modal";

type RemoveFn = (id: string, params?: { cascade?: boolean }) => Promise<void>;
type RemoveHost = { removeDmnDeployment: RemoveFn };

describe("<DeleteDmnDeploymentModal>", () => {
  const realRemove = api.removeDmnDeployment;
  let removeSpy: ReturnType<typeof vi.fn>;
  const toastEvents: unknown[] = [];

  beforeEach(() => {
    removeSpy = vi.fn();
    (api as unknown as RemoveHost).removeDmnDeployment = removeSpy as unknown as RemoveFn;
    toastEvents.length = 0;
    window.addEventListener("app:toast", (e) => toastEvents.push((e as CustomEvent).detail));
  });

  afterEach(() => {
    (api as unknown as RemoveHost).removeDmnDeployment = realRemove;
    cleanup();
  });

  it("renders nothing when deploymentId is null", () => {
    render(<DeleteDmnDeploymentModal deploymentId={null} onClose={vi.fn()} onSettled={vi.fn()} />);
    expect(screen.queryByTestId("delete-dmn-deployment-modal")).toBeNull();
  });

  it("renders header + cascade checkbox + Cancel + Delete when deploymentId is set", () => {
    render(
      <DeleteDmnDeploymentModal deploymentId="dmn-dep-1" onClose={vi.fn()} onSettled={vi.fn()} />,
    );
    expect(screen.getByTestId("delete-dmn-deployment-modal")).toBeInTheDocument();
    expect(screen.getByText("Delete DMN deployment")).toBeInTheDocument();
    expect(screen.getByText("dmn-dep-1")).toBeInTheDocument();
    expect(screen.getByTestId("dmn-cascade-checkbox")).not.toBeChecked();
    expect(screen.getByTestId("delete-dmn-confirm")).toBeInTheDocument();
  });

  it("delete success fires ok-toast and onSettled + onClose; the call omits cascade by default", async () => {
    const user = userEvent.setup();
    const onSettled = vi.fn();
    const onClose = vi.fn();
    removeSpy.mockResolvedValue(undefined);
    render(
      <DeleteDmnDeploymentModal deploymentId="dmn-dep-1" onClose={onClose} onSettled={onSettled} />,
    );
    await user.click(screen.getByTestId("delete-dmn-confirm"));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    expect(removeSpy).toHaveBeenCalledWith("dmn-dep-1", undefined);
    expect(onClose).toHaveBeenCalled();
    expect(
      toastEvents.some((t) => /Deleted DMN deployment/.test((t as { text: string }).text)),
    ).toBe(true);
  });

  it("cascade checkbox forwards { cascade: true } to the wrapper", async () => {
    const user = userEvent.setup();
    removeSpy.mockResolvedValue(undefined);
    render(
      <DeleteDmnDeploymentModal deploymentId="dmn-dep-1" onClose={vi.fn()} onSettled={vi.fn()} />,
    );
    await user.click(screen.getByTestId("dmn-cascade-checkbox"));
    await user.click(screen.getByTestId("delete-dmn-confirm"));
    await waitFor(() => expect(removeSpy).toHaveBeenCalled());
    expect(removeSpy).toHaveBeenCalledWith("dmn-dep-1", { cascade: true });
  });

  it("delete failure fires error-toast and still closes the modal (one-shot destructive)", async () => {
    const user = userEvent.setup();
    const onSettled = vi.fn();
    const onClose = vi.fn();
    removeSpy.mockRejectedValue(new FlowableError("Cannot delete: 409 Conflict", 409));
    render(
      <DeleteDmnDeploymentModal deploymentId="dmn-dep-1" onClose={onClose} onSettled={onSettled} />,
    );
    await user.click(screen.getByTestId("delete-dmn-confirm"));
    await waitFor(() => expect(onSettled).toHaveBeenCalled());
    // Modal closes on both paths — engine is source of truth.
    expect(onClose).toHaveBeenCalled();
    expect(toastEvents.some((t) => /Delete failed/.test((t as { text: string }).text))).toBe(true);
  });
});
