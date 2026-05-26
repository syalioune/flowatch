// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-DMN-deployment confirmation modal (Story 15.2).
 *
 * Mirrors `<DeleteDeploymentModal>` (Story 9.3) for the DMN namespace.
 * Renders a confirmation message naming the deployment id + a cascade
 * checkbox (default off; the operator opts into history loss) + a
 * Cancel + Delete action bar. Submitting calls
 * `api.removeDmnDeployment(id, {cascade})` and always communicates the
 * outcome via toast (one-shot destructive shape per CLAUDE.md
 * "Navigate-on-both vs in-modal-ErrorBox decision").
 */

import React from "react";
import { api } from "../api";
import { Icon, toast } from "../components";

export interface DeleteDmnDeploymentModalProps {
  /** When null, the modal is closed. Pass an id to open. */
  deploymentId: string | null;
  onClose: () => void;
  /** Fired after the request settles (success OR failure). */
  onSettled: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const DeleteDmnDeploymentModal: React.FC<DeleteDmnDeploymentModalProps> = ({
  deploymentId,
  onClose,
  onSettled,
  triggerRef,
}) => {
  const [cascade, setCascade] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const checkboxRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!deploymentId) return;
    setCascade(false);
    setBusy(false);
    setTimeout(() => checkboxRef.current?.focus(), 0);
  }, [deploymentId]);

  React.useEffect(() => {
    if (!deploymentId || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deploymentId, busy, onClose, triggerRef]);

  if (!deploymentId) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.removeDmnDeployment(deploymentId, cascade ? { cascade: true } : undefined);
      toast({
        kind: "ok",
        text: `Deleted DMN deployment ${deploymentId}.`,
        ttl: 3000,
      });
    } catch (err) {
      toast({
        kind: "err",
        text: "Delete failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    } finally {
      setBusy(false);
      onSettled();
      closeWithFocus();
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="delete-dmn-deployment-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-hd">
          <h3>Delete DMN deployment</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delete confirmation modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 12px" }}>
            About to delete DMN deployment <strong className="mono">{deploymentId}</strong>.
          </p>
          <p className="mute" style={{ margin: "0 0 16px", fontSize: 12 }}>
            Without cascade, the engine returns 409 if any historic decision execution still
            references a decision from this deployment.
          </p>
          <label
            htmlFor="dmn-cascade-delete"
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          >
            <input
              ref={checkboxRef}
              type="checkbox"
              id="dmn-cascade-delete"
              data-testid="dmn-cascade-checkbox"
              checked={cascade}
              onChange={(e) => setCascade(e.target.checked)}
              disabled={busy}
            />
            <span>Cascade delete (also remove decisions referenced by historic executions)</span>
          </label>
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="delete-dmn-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-dmn-confirm"
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
