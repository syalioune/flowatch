// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-deployment confirmation modal (Story 9.3).
 *
 * Replaces 9.1's `window.confirm()` placeholder. Renders the deployment's
 * name + id, a cascade checkbox (default off), and a Cancel + Delete
 * action bar. Submitting calls `api.deleteDeployment(id, cascade)` and
 * always communicates the outcome via toast (per Story 9.3 AC-5
 * rationale: delete is a one-shot decision; the modal closes either way).
 *
 * The modal reuses the `.modal-back` / `.modal` / `.modal-hd` / `.modal-bd`
 * / `.modal-ft` classes from src/styles.css (introduced by SettingsModal +
 * reused by Story 9.2's UploadDeploymentModal).
 */

import React from "react";
import { api, type FlowableDeployment } from "../api";
import { Icon, toast } from "../components";

export interface DeleteDeploymentModalProps {
  /** When null, the modal is closed. Pass a FlowableDeployment to open. */
  deployment: FlowableDeployment | null;
  onClose: () => void;
  /**
   * Fired after the request settles (success OR failure) so the parent
   * route can `router.invalidate(...)` defensively. The list reload is
   * cheap and keeps the UI in sync if the engine partially-succeeded the
   * delete before returning an error.
   */
  onSettled: () => void;
}

export const DeleteDeploymentModal: React.FC<DeleteDeploymentModalProps> = ({
  deployment,
  onClose,
  onSettled,
}) => {
  const [cascade, setCascade] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const checkboxRef = React.useRef<HTMLInputElement | null>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  // Reset state every time a NEW deployment is targeted (the route resets
  // deployment → null on close, then sets a fresh object on the next open).
  React.useEffect(() => {
    if (!deployment) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    setCascade(false);
    setBusy(false);
    setTimeout(() => checkboxRef.current?.focus(), 0);
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [deployment]);

  // Escape closes — suppressed while busy (AC-7: once the user clicks
  // Delete, the engine call has been made and the action is committed).
  React.useEffect(() => {
    if (!deployment || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [deployment, busy, onClose]);

  if (!deployment) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await api.deleteDeployment(deployment.id, cascade);
      toast({
        kind: "ok",
        text: `Deleted: ${deployment.name || deployment.id}`,
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
      onClose();
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="delete-deployment-modal"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-hd">
          <h3>Delete deployment</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close delete confirmation modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 12px" }}>
            About to delete <strong>{deployment.name || "(no name)"}</strong>.
          </p>
          <p className="mute" style={{ margin: "0 0 16px", fontSize: 12 }}>
            <span className="mono">{deployment.id}</span>
          </p>
          <label
            htmlFor="cascade-delete"
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          >
            <input
              ref={checkboxRef}
              type="checkbox"
              id="cascade-delete"
              data-testid="cascade-checkbox"
              checked={cascade}
              onChange={(e) => setCascade(e.target.checked)}
              disabled={busy}
            />
            <span>Also delete process instances created from this deployment (cascade)</span>
          </label>
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="delete-cancel"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-confirm"
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
