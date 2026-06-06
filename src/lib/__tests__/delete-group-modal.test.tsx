// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <DeleteGroupModal> (Story 22.3) — 25th modal in the
 * catalogue, 7th alertdialog. fallbackRef cross-domain N=2.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, FlowableError, type FlowableGroup } from "../../api";
import { DeleteGroupModal } from "../delete-group-modal";

const GROUP: FlowableGroup = { id: "g1", name: "G One", type: "security" };

const toastEvents: CustomEvent[] = [];
const onToast = (e: Event) => {
  toastEvents.push(e as CustomEvent);
};

describe("<DeleteGroupModal>", () => {
  const realDelete = api.deleteGroup;
  let deleteSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteSpy = vi.fn();
    (api as unknown as { deleteGroup: typeof api.deleteGroup }).deleteGroup =
      deleteSpy as unknown as typeof api.deleteGroup;
    toastEvents.length = 0;
    window.addEventListener("app:toast", onToast as EventListener);
  });

  afterEach(() => {
    (api as unknown as { deleteGroup: typeof api.deleteGroup }).deleteGroup = realDelete;
    window.removeEventListener("app:toast", onToast as EventListener);
    cleanup();
  });

  it("renders nothing when group is null", () => {
    const { container } = render(
      <DeleteGroupModal group={null} onClose={() => undefined} onSettled={() => undefined} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders alertdialog with ARIA contract on day one", async () => {
    render(
      <DeleteGroupModal group={GROUP} onClose={() => undefined} onSettled={() => undefined} />,
    );
    const dialog = await screen.findByRole("alertdialog", { name: "Delete group?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "delete-group-title");
  });

  it("fires success toast + onSettled + closes", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(<DeleteGroupModal group={GROUP} onClose={onClose} onSettled={onSettled} />);
    await user.click(await screen.findByTestId("delete-group-submit"));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("g1"));
    expect(onSettled).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect((toastEvents[0]?.detail as { kind?: string })?.kind).toBe("ok");
  });

  it("fires failure toast + onSettled + closes on engine error", async () => {
    deleteSpy.mockRejectedValue(new FlowableError("dependents", 409));
    const onClose = vi.fn();
    const onSettled = vi.fn();
    const user = userEvent.setup();
    render(<DeleteGroupModal group={GROUP} onClose={onClose} onSettled={onSettled} />);
    await user.click(await screen.findByTestId("delete-group-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSettled).toHaveBeenCalled();
    const detail = toastEvents[0]?.detail as { kind?: string; sub?: string };
    expect(detail.kind).toBe("err");
    expect(detail.sub).toBe("dependents");
  });

  it("Cancel does not submit + restores focus to triggerRef", async () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DeleteGroupModal
        group={GROUP}
        onClose={onClose}
        onSettled={() => undefined}
        triggerRef={{ current: trigger }}
      />,
    );
    await user.click(await screen.findByTestId("delete-group-cancel"));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("falls back to fallbackRef when triggerRef detaches", async () => {
    deleteSpy.mockResolvedValue(undefined);
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const fallback = document.createElement("button");
    document.body.appendChild(fallback);
    const onClose = vi.fn();
    const onSettled = vi.fn(() => trigger.remove());
    const user = userEvent.setup();
    render(
      <DeleteGroupModal
        group={GROUP}
        onClose={onClose}
        onSettled={onSettled}
        triggerRef={{ current: trigger }}
        fallbackRef={{ current: fallback }}
      />,
    );
    await user.click(await screen.findByTestId("delete-group-submit"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(document.activeElement).toBe(fallback);
    fallback.remove();
  });

  it("Esc closes", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DeleteGroupModal group={GROUP} onClose={onClose} onSettled={() => undefined} />);
    await screen.findByRole("heading", { name: "Delete group?" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("Delete button disabled while in-flight", async () => {
    let resolve: () => void = () => undefined;
    deleteSpy.mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    render(
      <DeleteGroupModal group={GROUP} onClose={() => undefined} onSettled={() => undefined} />,
    );
    const submit = (await screen.findByTestId("delete-group-submit")) as HTMLButtonElement;
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent(/deleting/i);
    resolve();
  });
});
