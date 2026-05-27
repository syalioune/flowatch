// SPDX-License-Identifier: Apache-2.0

/**
 * Keyboard cheatsheet modal — UX §11 / Story 18.4.
 *
 * 5th codified modal archetype: **discovery-shape** — read-only, opened
 * via global shortcut (`?`), closed via Esc, no submit/cancel buttons,
 * focus-trapped per the standard modal convention.
 *
 * Renders the src/lib/shortcuts.ts registry grouped by category. Each
 * key combo renders as <kbd> tags joined by `+` (chord) or thin space
 * (sequence).
 *
 * Carries the Story 18.2 modal ARIA contract: role="dialog" +
 * aria-modal="true" + aria-labelledby="cheatsheet-title".
 */

import React from "react";
import { Icon } from "../components";
import { listShortcutsByCategory, type ShortcutCategory, type ShortcutEntry } from "./shortcuts";

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  navigation: "Navigation",
  tweaks: "Theme tweaks",
  modals: "Modal / overlay controls",
};

const CATEGORY_ORDER: ReadonlyArray<ShortcutCategory> = ["navigation", "tweaks", "modals"];

export interface KeyboardCheatsheetModalProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

function renderKeys(entry: ShortcutEntry): React.ReactNode {
  // Sequences (g d) render the keys separated by a thin space; chords
  // (Ctrl+Shift+T) render with a literal `+`. The discriminator: if
  // every key is a single character AND there are 2 keys, it's a
  // sequence (matches our `g`-prefix shape). Otherwise it's a chord.
  const isSequence =
    entry.keys.length === 2 && entry.keys.every((k) => k.length === 1) && entry.keys[0] === "g";
  return entry.keys.map((k, i) => (
    <React.Fragment key={`${entry.label}-${k}-${i}`}>
      {i > 0 &&
        (isSequence ? <span className="kbd-sep"> </span> : <span className="kbd-sep">+</span>)}
      <kbd className="kbd">{k}</kbd>
    </React.Fragment>
  ));
}

export const KeyboardCheatsheetModal: React.FC<KeyboardCheatsheetModalProps> = ({
  open,
  onClose,
  triggerRef,
}) => {
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const closeWithFocus = React.useCallback(() => {
    onClose();
    setTimeout(() => triggerRef?.current?.focus(), 0);
  }, [onClose, triggerRef]);

  // Esc closes; modal owns its own listener (the global ? listener in
  // src/app.tsx does NOT handle Esc).
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeWithFocus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeWithFocus]);

  // Initial focus moves to the Close button on open.
  React.useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => clearTimeout(handle);
  }, [open]);

  if (!open) return null;

  const grouped = listShortcutsByCategory();

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; Escape lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the dialog owns interactivity
    <div className="modal-back" data-testid="cheatsheet-modal" onClick={closeWithFocus}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cheatsheet-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div className="modal-hd">
          <h3 id="cheatsheet-title">Keyboard shortcuts</h3>
          <button
            ref={closeBtnRef}
            type="button"
            className="icon-btn"
            aria-label="Close cheatsheet"
            data-testid="cheatsheet-close"
            onClick={closeWithFocus}
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd" style={{ overflow: "auto" }}>
          {CATEGORY_ORDER.map((cat) => {
            const entries = grouped[cat];
            if (entries.length === 0) return null;
            return (
              <section
                key={cat}
                style={{ marginBottom: 14 }}
                data-testid={`cheatsheet-section-${cat}`}
              >
                <h4 className="panel-title" style={{ marginBottom: 8 }}>
                  {CATEGORY_LABELS[cat]}
                </h4>
                <table className="tbl cheatsheet-tbl">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: 160 }}>
                        Keys
                      </th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.label} data-testid={`cheatsheet-row-${entry.label}`}>
                        <td>{renderKeys(entry)}</td>
                        <td>{entry.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
