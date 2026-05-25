// SPDX-License-Identifier: Apache-2.0

/**
 * RowActionMenu — keyboard-accessible `⋮` action menu for list-screen rows.
 *
 * Per Pattern P-006 (a11y): Tab focuses the trigger; Enter/Space opens the
 * menu and focuses the first item; ArrowUp/Down cycle (wrap); Home/End jump
 * to first/last; Enter/Space invokes the item and closes the menu; Escape
 * closes and restores focus to the trigger. Click-outside dismisses without
 * restoring focus (mouse path). ARIA roles: trigger has `aria-haspopup="menu"`
 * + `aria-expanded`; menu has `role="menu"`; items have `role="menuitem"`.
 *
 * Per Pattern P-007 (design tokens only): all styling lives in src/styles.css
 * under `.row-action-menu*` rules — uses --bg-elev / --border / --fg / --bad.
 *
 * Story 9.1 uses this for the two cascade variants of Delete on each
 * deployment row. Stories 9.4 (suspend/activate) and 10.x (cancel) copy it
 * verbatim.
 */

import React from "react";
import { createPortal } from "react-dom";

export interface RowActionItem {
  label: string;
  onSelect: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
  // Optional test-only attribute on the menu item <li>. Added in Story 11.1 so
  // placeholder forward-references (claim/complete/delegate/unclaim) can carry
  // stable testids that downstream swap stories (11.2 / 11.4 / 11.5) can use
  // as the swap point. Has no UX or rendering effect when omitted.
  testId?: string;
}

export interface RowActionMenuProps {
  items: RowActionItem[];
  ariaLabel?: string;
}

const nextEnabled = (items: RowActionItem[], from: number, step: 1 | -1): number => {
  const n = items.length;
  if (n === 0) return -1;
  let idx = from;
  for (let i = 0; i < n; i += 1) {
    idx = (idx + step + n) % n;
    if (!items[idx]?.disabled) return idx;
  }
  return -1;
};

const firstEnabled = (items: RowActionItem[]): number => {
  const idx = items.findIndex((it) => !it.disabled);
  return idx === -1 ? 0 : idx;
};

const lastEnabled = (items: RowActionItem[]): number => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (!items[i]?.disabled) return i;
  }
  return items.length - 1;
};

// The menu renders below the trigger by default; flip upward when the trigger
// sits too close to the viewport bottom to fit the menu.
interface MenuPosition {
  top: number;
  left: number;
  // When the menu is flipped above the trigger, `top` is the upper edge of
  // the menu (so callers don't need to know the orientation).
  placement: "below" | "above";
}

// Estimate the menu's height so we can pick the placement before paint.
// Per-item ≈ 28px (padding 6 × 2 + line ≈ 16); container padding 4 × 2 = 8.
const estimateMenuHeight = (itemCount: number): number => Math.max(36, itemCount * 28 + 8);

export const RowActionMenu: React.FC<RowActionMenuProps> = ({
  items,
  ariaLabel = "Open row actions",
}) => {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [position, setPosition] = React.useState<MenuPosition | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLUListElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLLIElement | null>>([]);

  // Compute the portal-anchored position so the menu escapes `.tbl-wrap`'s
  // `overflow: hidden` (which would otherwise clip the menu on bottom-row
  // triggers). The menu is rendered to document.body via createPortal; the
  // position is recomputed on every open + on scroll/resize while open.
  const computePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = estimateMenuHeight(items.length);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    // Flip upward only when below doesn't fit AND above fits better. The
    // 8px buffer keeps the menu off the viewport edge.
    const flipAbove = spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow;
    const menuWidth = 160; // matches `.row-action-menu-list min-width`
    setPosition({
      top: flipAbove
        ? Math.max(8, rect.top - menuHeight - 4)
        : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4),
      // Anchor to the trigger's right edge (matching the old absolute layout)
      // while keeping the menu inside the viewport horizontally.
      left: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)),
      placement: flipAbove ? "above" : "below",
    });
  }, [items.length]);

  const openMenu = React.useCallback(
    (preferLast = false) => {
      const start = preferLast ? lastEnabled(items) : firstEnabled(items);
      setActiveIndex(start);
      computePosition();
      setOpen(true);
    },
    [items, computePosition],
  );

  // Re-position on scroll / resize while open so the menu tracks its trigger.
  // Capture-phase listener so nested-scroll containers (e.g. `.tbl-wrap`) bubble
  // their scroll events to us before we compute the new position.
  React.useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => computePosition();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, computePosition]);

  const closeMenu = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      // setTimeout zero: allow React to flush the state update before re-focusing,
      // so the focus doesn't race with the menu unmount.
      // preventScroll: don't auto-scroll the trigger into view — it's already
      // visible (it's where the user just clicked).
      setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[activeIndex];
    // preventScroll: focusing a menu item normally scrolls it into view, which
    // jerks the table when the menu opens below the viewport fold. The menu
    // is absolutely positioned right next to the trigger; the operator
    // doesn't need an auto-scroll.
    el?.focus({ preventScroll: true });
  }, [open, activeIndex]);

  React.useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      const inTrigger = triggerRef.current?.contains(t);
      const inMenu = menuRef.current?.contains(t);
      if (!inTrigger && !inMenu) {
        closeMenu(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, closeMenu]);

  const handleTriggerKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault();
      openMenu(false);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(true);
    }
  };

  const invoke = (idx: number) => {
    const item = items[idx];
    if (!item || item.disabled) return;
    // Close before invoking so the consumer's onSelect can navigate / focus
    // without our setTimeout-restore-focus stealing focus back.
    setOpen(false);
    try {
      void item.onSelect();
    } catch {
      /* swallowed: consumer is responsible for surfacing errors via toast/ErrorBox */
    }
  };

  const handleMenuKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((idx) => nextEnabled(items, idx, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((idx) => nextEnabled(items, idx, -1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(firstEnabled(items));
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(lastEnabled(items));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      invoke(activeIndex);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      closeMenu(true);
    }
  };

  return (
    <span className="row-action-menu" style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        className="row-action-menu-trigger btn"
        data-size="sm"
        data-variant="ghost"
        data-testid="row-action-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            closeMenu(false);
          } else {
            openMenu(false);
          }
        }}
        onKeyDown={handleTriggerKey}
      >
        ⋮
      </button>
      {open &&
        position &&
        createPortal(
          <ul
            ref={menuRef}
            // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA Authoring Practices specify role="menu" on the container of a menu widget
            role="menu"
            className="row-action-menu-list"
            data-placement={position.placement}
            onKeyDown={handleMenuKey}
            aria-label={ariaLabel}
            style={{
              // Override the CSS defaults (`position: absolute; top: calc(100% + 4px); right: 0;`)
              // so the portal-mounted menu is anchored to the viewport instead.
              position: "fixed",
              top: position.top,
              left: position.left,
              right: "auto",
            }}
          >
            {items.map((item, i) => (
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation lives on the parent <ul> via handleMenuKey (Enter/Space dispatches to invoke())
              <li
                ref={(node) => {
                  itemRefs.current[i] = node;
                }}
                // biome-ignore lint/suspicious/noArrayIndexKey: menu items are ephemeral and have no persistent identity beyond their position
                key={`${item.label}-${i}`}
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA Authoring Practices specify role="menuitem" on each menu child
                role="menuitem"
                tabIndex={activeIndex === i ? 0 : -1}
                aria-disabled={item.disabled || undefined}
                data-danger={item.danger ? "1" : undefined}
                data-testid={item.testId}
                className="row-action-menu-item"
                onClick={(e) => {
                  e.stopPropagation();
                  invoke(i);
                }}
              >
                {item.label}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </span>
  );
};
