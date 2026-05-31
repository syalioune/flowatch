// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-connection modal (Story 23.1) — 28th modal in the catalogue, 9th
 * `alertdialog` instance.
 *
 * One-shot destructive shape, but divergent from the canonical
 * navigate-on-both: localStorage delete has effectively no failure path
 * EXCEPT the active-connection guard (`Cannot delete the active connection.
 * Switch active first.`). That guard fires inline (in-modal ErrorBox + modal
 * stays open) because the operator's recovery is "switch active first, then
 * delete" — not "give up and dismiss." The standard navigate-on-both shape
 * would dismiss the modal and force the operator to re-find the row.
 *
 * Cross-domain `fallbackRef` consumer N=3 (after Story 19.2 variable-delete
 * originator + Story 22.2/22.3 identity-delete N=2). The trigger row gets
 * unmounted on successful delete; fallback to the Manage-connections panel's
 * stable `Add connection` button ref.
 */

import React from "react";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";
import { deleteConnection, type SavedConnection } from "./saved-connections";

export interface DeleteConnectionModalProps {
  open: boolean;
  onClose: () => void;
  connection: SavedConnection | null;
  onSuccess: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Fallback when triggerRef.current detaches on successful delete. */
  fallbackRef?: React.RefObject<HTMLElement | null>;
}

export const DeleteConnectionModal: React.FC<DeleteConnectionModalProps> = ({
  open,
  onClose,
  connection,
  onSuccess,
  triggerRef,
  fallbackRef,
}) => {
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open || !connection) return;
    setError(null);
    setBusy(false);
    setTimeout(() => cancelRef.current?.focus(), 0);
  }, [open, connection]);

  const restoreFocus = React.useCallback(() => {
    const trigger = triggerRef?.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
      return;
    }
    fallbackRef?.current?.focus();
  }, [triggerRef, fallbackRef]);

  React.useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        restoreFocus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, restoreFocus]);

  if (!open || !connection) return null;

  const closeWithFocus = () => {
    restoreFocus();
    onClose();
  };

  const submit = () => {
    setError(null);
    setBusy(true);
    try {
      deleteConnection(connection.id);
      setBusy(false);
      onSuccess();
      // restoreFocus prefers triggerRef but falls back when the row unmounted.
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
      data-testid="delete-connection-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-connection-title"
        aria-describedby="delete-connection-body"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="delete-connection-title">Delete connection</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delete connection modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          {error && (
            <div style={{ marginBottom: 12 }}>
              <ErrorBox error={error} />
            </div>
          )}
          <p id="delete-connection-body" style={{ margin: "0 0 8px" }}>
            Delete <strong>{connection.label}</strong> (
            <span className="mono">{connection.baseUrl}</span>)? This action cannot be undone.
          </p>
        </div>
        <div className="modal-ft">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            data-testid="delete-connection-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-connection-confirm"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete connection"}
          </button>
        </div>
      </div>
    </div>
  );
};
