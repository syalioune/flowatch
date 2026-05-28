// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-variable confirmation modal (Story 19.2).
 *
 * One-shot destructive archetype — mirrors `<DeleteDeploymentModal>` /
 * `<CancelInstanceModal>`. Closes on BOTH success and failure; the outcome
 * is carried by a toast (per CLAUDE.md "Modal conventions" — destructive
 * actions don't preserve form input because the form input IS the variable
 * identity, already known from the row).
 *
 * ARIA convention (Epic 18.2 codification): `role="alertdialog"` (the
 * destructive variant) + aria-modal + aria-labelledby on day one.
 * Screen readers announce alertdialog with a higher-priority interrupt
 * than dialog — appropriate for state-destroying actions.
 */

import React from "react";
import { api, type FlowableVariable } from "../api";
import { Icon, toast } from "../components";

export interface DeleteVariableModalProps {
  /** When null, the modal is closed. Pass a FlowableVariable to open. */
  variable: FlowableVariable | null;
  instanceId: string;
  onClose: () => void;
  /**
   * Fired after the request settles (success only). The parent panel
   * reloads via `variables.reload()` so the row disappears.
   */
  onDeleted?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Story 19.2 review patch: after a successful delete, the row that owned
   * `triggerRef` is removed from the DOM. The default `triggerRef.current?.focus()`
   * silently no-ops on a detached element, leaving focus on `<body>`.
   * Callers can pass a `fallbackRef` that's still in the DOM (e.g. the
   * panel-level Add or Refresh button) so focus-restore stays operator-feel-correct.
   */
  fallbackRef?: React.RefObject<HTMLElement | null>;
}

const formatValuePreview = (value: unknown, type?: string): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (type === "string") return `"${String(value)}"`;
  if (type === "json") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const DeleteVariableModal: React.FC<DeleteVariableModalProps> = ({
  variable,
  instanceId,
  onClose,
  onDeleted,
  triggerRef,
  fallbackRef,
}) => {
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!variable) return;
    setBusy(false);
    setTimeout(() => cancelRef.current?.focus(), 0);
  }, [variable]);

  // Pick the best focus target: the original trigger if it's still in the
  // DOM, otherwise the caller's fallback (typically the panel's Add or
  // Refresh button — guaranteed still mounted). `document.contains(null)`
  // returns false, so the chain naturally falls through if both are missing.
  const restoreFocus = React.useCallback(() => {
    const trigger = triggerRef?.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
      return;
    }
    fallbackRef?.current?.focus();
  }, [triggerRef, fallbackRef]);

  React.useEffect(() => {
    if (!variable || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        restoreFocus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variable, busy, onClose, restoreFocus]);

  if (!variable) return null;

  const closeWithFocus = () => {
    restoreFocus();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.deleteInstanceVariable(instanceId, variable.name);
      toast({
        kind: "ok",
        text: `Variable ${variable.name} deleted`,
        ttl: 3000,
      });
      onDeleted?.();
    } catch (err) {
      toast({
        kind: "err",
        text: `Failed to delete variable ${variable.name}`,
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    } finally {
      setBusy(false);
      closeWithFocus();
    }
  };

  const valuePreview = formatValuePreview(variable.value, variable.type);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="delete-variable-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-variable-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="delete-variable-title">Delete variable?</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delete variable modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 12px" }}>
            About to delete <strong className="mono">{variable.name}</strong>.
          </p>
          <dl
            style={{
              margin: 0,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 12,
              rowGap: 4,
              fontSize: 12,
            }}
          >
            <dt className="mute">Type</dt>
            <dd style={{ margin: 0 }}>
              <span className="mono">{variable.type ?? "—"}</span>
            </dd>
            <dt className="mute">Value</dt>
            <dd style={{ margin: 0 }}>
              <span className="mono" style={{ wordBreak: "break-all" }}>
                {valuePreview}
              </span>
            </dd>
          </dl>
        </div>
        <div className="modal-ft">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            data-testid="delete-variable-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-variable-submit"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};
