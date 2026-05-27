// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for <KeyboardCheatsheetModal> (Story 18.4).
 *
 * Discovery-shape modal — read-only, opened via global shortcut, closed
 * via Esc. The cheatsheet renders the src/lib/shortcuts.ts registry
 * grouped by category. Tests cover the four-state contract (closed /
 * open / Esc / Close button), the registry-driven rendering, and the
 * Story 18.2 modal ARIA contract.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyboardCheatsheetModal } from "../keyboard-cheatsheet-modal";

describe("<KeyboardCheatsheetModal>", () => {
  afterEach(() => cleanup());

  it("renders nothing when open is false", () => {
    render(<KeyboardCheatsheetModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId("cheatsheet-modal")).toBeNull();
  });

  it("renders the modal with dialog ARIA contract when open is true", () => {
    render(<KeyboardCheatsheetModal open={true} onClose={vi.fn()} />);
    const modal = screen.getByTestId("cheatsheet-modal");
    expect(modal).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "cheatsheet-title");
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("renders all three category sections", () => {
    render(<KeyboardCheatsheetModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("cheatsheet-section-navigation")).toBeInTheDocument();
    expect(screen.getByTestId("cheatsheet-section-tweaks")).toBeInTheDocument();
    expect(screen.getByTestId("cheatsheet-section-modals")).toBeInTheDocument();
  });

  it("renders the load-bearing entries from the registry", () => {
    render(<KeyboardCheatsheetModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId("cheatsheet-row-Open keyboard shortcuts")).toBeInTheDocument();
    expect(screen.getByTestId("cheatsheet-row-Toggle theme tweaks panel")).toBeInTheDocument();
    expect(screen.getByTestId("cheatsheet-row-Go to Dashboard")).toBeInTheDocument();
    expect(screen.getByTestId("cheatsheet-row-Go to Process instances")).toBeInTheDocument();
    expect(screen.getByTestId("cheatsheet-row-Go to Tasks")).toBeInTheDocument();
    // Esc binding from the modals category.
    expect(screen.getByTestId("cheatsheet-row-Close modal / drawer / popup")).toBeInTheDocument();
  });

  it("renders chord keys (Ctrl+Shift+T) joined by + separators", () => {
    render(<KeyboardCheatsheetModal open={true} onClose={vi.fn()} />);
    const row = screen.getByTestId("cheatsheet-row-Toggle theme tweaks panel");
    const kbds = row.querySelectorAll<HTMLElement>("kbd.kbd");
    expect(kbds).toHaveLength(3);
    expect(kbds[0]?.textContent).toBe("Ctrl");
    expect(kbds[1]?.textContent).toBe("Shift");
    expect(kbds[2]?.textContent).toBe("T");
    const seps = row.querySelectorAll(".kbd-sep");
    expect(seps).toHaveLength(2);
    for (const sep of Array.from(seps)) {
      expect(sep.textContent).toBe("+");
    }
  });

  it("renders sequence keys (g d) with space separator", () => {
    render(<KeyboardCheatsheetModal open={true} onClose={vi.fn()} />);
    const row = screen.getByTestId("cheatsheet-row-Go to Dashboard");
    const kbds = row.querySelectorAll<HTMLElement>("kbd.kbd");
    expect(kbds).toHaveLength(2);
    expect(kbds[0]?.textContent).toBe("g");
    expect(kbds[1]?.textContent).toBe("d");
    const seps = row.querySelectorAll(".kbd-sep");
    expect(seps).toHaveLength(1);
    // Sequence separator is a single space.
    expect(seps[0]?.textContent).toBe(" ");
  });

  it("Escape key calls onClose", () => {
    const onClose = vi.fn();
    render(<KeyboardCheatsheetModal open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Close button (data-testid=cheatsheet-close) calls onClose", () => {
    const onClose = vi.fn();
    render(<KeyboardCheatsheetModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("cheatsheet-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Backdrop click calls onClose", () => {
    const onClose = vi.fn();
    render(<KeyboardCheatsheetModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("cheatsheet-modal"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Clicking inside the dialog body does NOT call onClose (stopPropagation)", () => {
    const onClose = vi.fn();
    render(<KeyboardCheatsheetModal open={true} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Esc listener does NOT fire when modal is closed", () => {
    const onClose = vi.fn();
    render(<KeyboardCheatsheetModal open={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("restores focus to triggerRef on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    const triggerRef = { current: trigger } as React.RefObject<HTMLElement | null>;
    const onClose = vi.fn();
    render(<KeyboardCheatsheetModal open={true} onClose={onClose} triggerRef={triggerRef} />);
    const focusSpy = vi.spyOn(trigger, "focus");
    fireEvent.click(screen.getByTestId("cheatsheet-close"));
    // Focus restoration is scheduled via setTimeout(_, 0); flush microtasks.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(focusSpy).toHaveBeenCalled();
        document.body.removeChild(trigger);
        resolve();
      }, 10);
    });
  });
});
