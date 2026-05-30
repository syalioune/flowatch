// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-attachment confirmation modal (Story 21.3) — 19th modal in the
 * catalogue, 5th instance of the one-shot-destructive `alertdialog`
 * archetype. Mirrors `<DeleteVariableModal>` verbatim.
 *
 * Per CLAUDE.md "Navigate-on-both vs in-modal-ErrorBox decision": destructive
 * actions close the modal on BOTH success and failure; a toast carries the
 * outcome. The engine is the source of truth — the parent panel reloads
 * regardless and the row presence/absence reflects current state.
 *
 * ARIA convention (Epic 18.2): `role="alertdialog"` + aria-modal +
 * aria-labelledby.
 */

import React from "react";
import { api, type FlowableAttachment } from "../api";
import { Icon, toast } from "../components";

export interface DeleteAttachmentModalProps {
  /** When null, the modal is closed. Pass an attachment to open. */
  attachment: FlowableAttachment | null;
  taskId: string;
  onClose: () => void;
  /**
   * Fired after the request settles (success OR failure). The parent panel
   * reloads via `attachments.reload()` so the row disappears (success) or
   * stays put (failure — engine rejected; row is still authoritative).
   */
  onSettled?: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /**
   * After a successful delete, the row that owned `triggerRef` is removed
   * from the DOM. Callers can pass a `fallbackRef` that's still mounted
   * (e.g. the panel-level Add or Refresh button) so focus-restore stays
   * operator-feel-correct. Mirrors `<DeleteVariableModal>` Story 19.2 P-N.
   */
  fallbackRef?: React.RefObject<HTMLElement | null>;
}

export const DeleteAttachmentModal: React.FC<DeleteAttachmentModalProps> = ({
  attachment,
  taskId,
  onClose,
  onSettled,
  triggerRef,
  fallbackRef,
}) => {
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!attachment) return;
    setBusy(false);
    setTimeout(() => cancelRef.current?.focus(), 0);
  }, [attachment]);

  const restoreFocus = React.useCallback(() => {
    const trigger = triggerRef?.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
      return;
    }
    fallbackRef?.current?.focus();
  }, [triggerRef, fallbackRef]);

  React.useEffect(() => {
    if (!attachment || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        restoreFocus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attachment, busy, onClose, restoreFocus]);

  if (!attachment) return null;

  const closeWithFocus = () => {
    restoreFocus();
    onClose();
  };

  const displayName = attachment.name || attachment.id;

  const submit = async () => {
    setBusy(true);
    try {
      await api.deleteTaskAttachment(taskId, attachment.id);
      toast({
        kind: "ok",
        text: `Deleted attachment: ${displayName}`,
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
      onSettled?.();
      closeWithFocus();
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="delete-attachment-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-attachment-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
      >
        <div className="modal-hd">
          <h3 id="delete-attachment-title">Delete attachment?</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delete attachment modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 12px" }}>
            About to permanently delete <strong className="mono">{displayName}</strong> from this
            task. This cannot be undone.
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
            {attachment.externalUrl ? (
              <>
                <dt className="mute">URL</dt>
                <dd style={{ margin: 0 }}>
                  <span className="mono" style={{ wordBreak: "break-all" }}>
                    {attachment.externalUrl}
                  </span>
                </dd>
              </>
            ) : (
              attachment.type && (
                <>
                  <dt className="mute">Type</dt>
                  <dd style={{ margin: 0 }}>
                    <span className="mono">{attachment.type}</span>
                  </dd>
                </>
              )
            )}
          </dl>
        </div>
        <div className="modal-ft">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            data-testid="delete-attachment-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-attachment-confirm"
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
