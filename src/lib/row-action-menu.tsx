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

export const RowActionMenu: React.FC<RowActionMenuProps> = ({
  items,
  ariaLabel = "Open row actions",
}) => {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const menuRef = React.useRef<HTMLUListElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLLIElement | null>>([]);

  const openMenu = React.useCallback(
    (preferLast = false) => {
      const start = preferLast ? lastEnabled(items) : firstEnabled(items);
      setActiveIndex(start);
      setOpen(true);
    },
    [items],
  );

  const closeMenu = React.useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      // setTimeout zero: allow React to flush the state update before re-focusing,
      // so the focus doesn't race with the menu unmount.
      setTimeout(() => triggerRef.current?.focus(), 0);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[activeIndex];
    el?.focus();
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
      {open && (
        <ul
          ref={menuRef}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA Authoring Practices specify role="menu" on the container of a menu widget
          role="menu"
          className="row-action-menu-list"
          onKeyDown={handleMenuKey}
          aria-label={ariaLabel}
        >
          {items.map((item, i) => (
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
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard activation lives on the parent <ul> via handleMenuKey (Enter/Space dispatches to invoke())
              onClick={(e) => {
                e.stopPropagation();
                invoke(i);
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
};
