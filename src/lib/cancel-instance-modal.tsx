// SPDX-License-Identifier: Apache-2.0

/**
 * Cancel-process-instance confirmation modal (Story 10.3).
 *
 * Replaces 10.1's `Cancel` placeholder on `/instances` AND the `prompt()`
 * call on the `/instances/$id` detail page. Renders a context line + an
 * optional reason textarea + Cancel / Confirm cancellation buttons.
 *
 * Reuses the `.modal-back` / `.modal` / `.modal-hd` / `.modal-bd` /
 * `.modal-ft` palette from 9.3 verbatim — the form-control swap (checkbox
 * → textarea) is the only material difference. Per Epic 9 retro §5 prep
 * #3 decision: do NOT extract a generic `<ConfirmActionModal>` archetype
 * here; copy-now is the right shape until a third confirmation modal
 * surfaces.
 *
 * Failure surfaces via toast (one-shot decision; mirrors 9.3) — not
 * in-modal ErrorBox (which would be the wrong shape since the operator
 * committed by clicking Confirm; the reason is short enough to re-type if
 * retry is needed).
 */

import React from "react";
import { api, type FlowableProcessInstance } from "../api";
import { Icon, toast } from "../components";
import { NAV_INVALIDATE_COUNTS } from "./nav-events";

export interface CancelInstanceModalProps {
  /** When null, the modal is closed. Pass a FlowableProcessInstance to open. */
  instance: FlowableProcessInstance | null;
  onClose: () => void;
  /**
   * Fires after the request settles (success OR failure) so the parent can
   * navigate / invalidate / reload. Identical contract to 9.3's `onSettled`.
   */
  onSettled: () => void;
  /**
   * Focus-restore target (Epic 9 retro A-4). Same shape standardised in
   * Story 10.2.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const CancelInstanceModal: React.FC<CancelInstanceModalProps> = ({
  instance,
  onClose,
  onSettled,
  triggerRef,
}) => {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!instance) return;
    setReason("");
    setBusy(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [instance]);

  React.useEffect(() => {
    if (!instance || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [instance, busy, onClose, triggerRef]);

  if (!instance) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    const trimmed = reason.trim();
    setBusy(true);
    try {
      if (trimmed) {
        await api.deleteProcessInstance(instance.id, trimmed);
      } else {
        await api.deleteProcessInstance(instance.id);
      }
      toast({
        kind: "ok",
        text: `Cancelled: ${instance.businessKey || instance.id}`,
        ttl: 3000,
      });
      // Cancelling an instance decrements the Sidebar's `instances` badge AND
      // may also drop a `tasks` row (if a user-task was active). The
      // refreshNavCounts listener handles both in one fetch sweep.
      window.dispatchEvent(new CustomEvent(NAV_INVALIDATE_COUNTS));
    } catch (err) {
      toast({
        kind: "err",
        text: "Cancel failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    } finally {
      setBusy(false);
      onSettled();
      closeWithFocus();
    }
  };

  const wide = instance as FlowableProcessInstance & {
    processDefinitionKey?: string;
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="cancel-instance-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-hd">
          <h3>Cancel process instance</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close cancel confirmation modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 4px" }}>
            About to cancel <strong>{instance.businessKey || instance.id}</strong>.
          </p>
          <p className="mute" style={{ margin: "0 0 16px", fontSize: 12 }}>
            <span className="mono">{instance.id}</span>
            {wide.processDefinitionKey && (
              <>
                {" · "}
                <span className="mono">{wide.processDefinitionKey}</span>
              </>
            )}
          </p>
          <label
            htmlFor="cancel-instance-reason"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Reason (optional)
          </label>
          <textarea
            ref={textareaRef}
            id="cancel-instance-reason"
            data-testid="cancel-instance-reason"
            placeholder="e.g. duplicate run; customer requested abort"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
            rows={3}
            style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
          />
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="cancel-instance-modal-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="cancel-instance-modal-confirm"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Cancelling…" : "Confirm cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
};
