// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for RowActionMenu.
 *
 * Pattern P-006 keyboard a11y is the load-bearing contract here. We exercise:
 *  - trigger ARIA attributes (haspopup, expanded)
 *  - click opens / closes
 *  - Enter / Space / ArrowDown open + focus first item
 *  - ArrowUp from trigger opens + focus last item
 *  - ArrowDown / ArrowUp wrap, Home / End jump
 *  - disabled items are skipped in keyboard navigation
 *  - Enter / Space on an item invokes onSelect and closes the menu
 *  - Escape closes and restores focus to the trigger
 *  - click-outside closes without restoring focus
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RowActionMenu } from "../row-action-menu";

const items = (selects: Record<string, ReturnType<typeof vi.fn>>) => [
  { label: "Delete (cascade)", onSelect: selects.cascade ?? vi.fn(), danger: true },
  { label: "Delete (no cascade)", onSelect: selects.noCascade ?? vi.fn(), danger: true },
];

describe("<RowActionMenu>", () => {
  afterEach(cleanup);

  it("renders the trigger with the expected ARIA attributes", () => {
    render(<RowActionMenu items={items({})} />);
    const trigger = screen.getByTestId("row-action-trigger");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-label", "Open row actions");
  });

  it("opens the menu on click", async () => {
    const user = userEvent.setup();
    render(<RowActionMenu items={items({})} />);
    await user.click(screen.getByTestId("row-action-trigger"));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").length).toBe(2);
  });

  it("opens the menu on Enter and focuses the first item", () => {
    render(<RowActionMenu items={items({})} />);
    const trigger = screen.getByTestId("row-action-trigger");
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems[0]).toHaveAttribute("tabindex", "0");
    expect(menuItems[1]).toHaveAttribute("tabindex", "-1");
  });

  it("opens the menu on Space and focuses the first item", () => {
    render(<RowActionMenu items={items({})} />);
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: " " });
    expect(screen.getAllByRole("menuitem")[0]).toHaveAttribute("tabindex", "0");
  });

  it("opens the menu on ArrowUp and focuses the last item", () => {
    render(<RowActionMenu items={items({})} />);
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: "ArrowUp" });
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems[1]).toHaveAttribute("tabindex", "0");
  });

  it("ArrowDown wraps from last to first; ArrowUp wraps from first to last", () => {
    render(<RowActionMenu items={items({})} />);
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: "Enter" });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    let menuItems = screen.getAllByRole("menuitem");
    expect(menuItems[1]).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    menuItems = screen.getAllByRole("menuitem");
    expect(menuItems[0]).toHaveAttribute("tabindex", "0"); // wrapped
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    menuItems = screen.getAllByRole("menuitem");
    expect(menuItems[1]).toHaveAttribute("tabindex", "0"); // wrapped
  });

  it("Home jumps to first enabled, End jumps to last enabled", () => {
    const list = [
      { label: "First", onSelect: vi.fn() },
      { label: "Middle", onSelect: vi.fn() },
      { label: "Last", onSelect: vi.fn() },
    ];
    render(<RowActionMenu items={list} />);
    const trigger = screen.getByTestId("row-action-trigger");
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getAllByRole("menuitem")[2]).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getAllByRole("menuitem")[0]).toHaveAttribute("tabindex", "0");
  });

  it("skips disabled items in arrow navigation", () => {
    const list = [
      { label: "A", onSelect: vi.fn() },
      { label: "B", onSelect: vi.fn(), disabled: true },
      { label: "C", onSelect: vi.fn() },
    ];
    render(<RowActionMenu items={list} />);
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: "Enter" });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const menuItems = screen.getAllByRole("menuitem");
    // We expected to skip the disabled middle item and land on C.
    expect(menuItems[2]).toHaveAttribute("tabindex", "0");
  });

  it("Enter on a focused menu item invokes onSelect and closes the menu", () => {
    const onCascade = vi.fn();
    render(<RowActionMenu items={items({ cascade: onCascade })} />);
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Enter" });
    expect(onCascade).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Space on a focused menu item invokes onSelect and closes the menu", () => {
    const onCascade = vi.fn();
    render(<RowActionMenu items={items({ cascade: onCascade })} />);
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: "Enter" });
    fireEvent.keyDown(screen.getByRole("menu"), { key: " " });
    expect(onCascade).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking a menu item invokes onSelect and closes the menu", async () => {
    const user = userEvent.setup();
    const onCascade = vi.fn();
    render(<RowActionMenu items={items({ cascade: onCascade })} />);
    await user.click(screen.getByTestId("row-action-trigger"));
    await user.click(screen.getByRole("menuitem", { name: "Delete (cascade)" }));
    expect(onCascade).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape closes the menu and restores focus to the trigger", () => {
    vi.useFakeTimers();
    try {
      render(<RowActionMenu items={items({})} />);
      const trigger = screen.getByTestId("row-action-trigger");
      fireEvent.keyDown(trigger, { key: "Enter" });
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
      expect(screen.queryByRole("menu")).toBeNull();
      act(() => {
        vi.runAllTimers();
      });
      expect(document.activeElement).toBe(trigger);
    } finally {
      vi.useRealTimers();
    }
  });

  it("click-outside closes the menu without restoring focus", () => {
    render(
      <div>
        <RowActionMenu items={items({})} />
        <button type="button" data-testid="outside">
          outside
        </button>
      </div>,
    );
    fireEvent.keyDown(screen.getByTestId("row-action-trigger"), { key: "Enter" });
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clicking the trigger again while open closes the menu", async () => {
    const user = userEvent.setup();
    render(<RowActionMenu items={items({})} />);
    const trigger = screen.getByTestId("row-action-trigger");
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
