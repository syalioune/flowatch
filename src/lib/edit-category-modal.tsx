// SPDX-License-Identifier: Apache-2.0

/**
 * Edit-category modal (Story 20.1) — 16th modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<EditVariableModal>` (Story 19.1)
 * verbatim. Single text input for the definition's `category` field. Empty
 * input is ALLOWED — the engine accepts `{category: ""}` to revert the
 * category to default (compat.md line 149). Form value is preserved across
 * failed submits; in-modal `<ErrorBox>` surfaces the verbatim engine message;
 * modal closes on success and the parent re-fetches via its `reload` prop.
 *
 * ARIA convention (Epic 18.2 codification): role="dialog" + aria-modal +
 * aria-labelledby on day one.
 *
 * The category PUT funnels through `api.updateProcessDefinition` — same wire
 * URL as `api.suspendProcessDefinition`, distinct operator-feel action (see
 * the wrapper's JSDoc + CLAUDE.md "Operator-feel UI labels can diverge from
 * wire-level action verbs", Story 12.2 codification).
 */

import React from "react";
import { api, type FlowableProcessDefinition } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface EditCategoryModalProps {
  /** When null, the modal is closed. Pass a definition to open. */
  definition: FlowableProcessDefinition | null;
  onClose: () => void;
  /** Fired after a successful PUT. Parent calls `router.invalidate()` here. */
  onSuccess?: () => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  definition,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!definition) return;
    setValue(definition.category ?? "");
    setError(null);
    setBusy(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [definition]);

  React.useEffect(() => {
    if (!definition || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [definition, busy, onClose, triggerRef]);

  if (!definition) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.updateProcessDefinition(definition.id, { category: value });
      setBusy(false);
      onSuccess?.();
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="edit-category-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-category-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="edit-category-title">Edit category</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-disabled={busy}
            aria-label="Close edit category modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) submit();
          }}
        >
          <div className="modal-bd">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox error={error} />
              </div>
            )}
            <p className="mute" style={{ margin: "0 0 12px", fontSize: 12 }}>
              Editing <span className="mono">{definition.name || definition.key}</span> (key:{" "}
              <span className="mono">{definition.key}</span>)
            </p>
            <label
              htmlFor="edit-category-input"
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Category
            </label>
            <input
              ref={inputRef}
              id="edit-category-input"
              data-testid="edit-category-input"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              maxLength={255}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
            <p className="mute" style={{ margin: "6px 0 0", fontSize: 11 }}>
              Leave empty to clear the category — the engine reverts to default.
            </p>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="edit-category-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="edit-category-submit"
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
