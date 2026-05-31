// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-group confirmation modal (Story 22.3) — 25th modal in the catalogue,
 * 7th `alertdialog` instance.
 *
 * One-shot destructive archetype — mirrors `<DeleteUserModal>` (Story 22.2)
 * verbatim. Second cross-domain consumer of Story 19.2's `fallbackRef`
 * pattern. Navigate-on-both per CLAUDE.md decision matrix.
 *
 * Engine cascades group-membership join rows server-side (verified live in
 * T-12 Probe 7 — the modal copy mentions the cascade so the operator is
 * informed without needing a separate cascade checkbox).
 *
 * ARIA convention (Epic 18.2): role="alertdialog" + aria-modal + aria-
 * labelledby on day one.
 */

import React from "react";
import { api, type FlowableGroup } from "../api";
import { Icon, toast } from "../components";

export interface DeleteGroupModalProps {
  group: FlowableGroup | null;
  onClose: () => void;
  onSettled: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  fallbackRef?: React.RefObject<HTMLElement | null>;
}

export const DeleteGroupModal: React.FC<DeleteGroupModalProps> = ({
  group,
  onClose,
  onSettled,
  triggerRef,
  fallbackRef,
}) => {
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!group) return;
    setBusy(false);
    setTimeout(() => cancelRef.current?.focus(), 0);
  }, [group]);

  const restoreFocus = React.useCallback(() => {
    const trigger = triggerRef?.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
      return;
    }
    fallbackRef?.current?.focus();
  }, [triggerRef, fallbackRef]);

  React.useEffect(() => {
    if (!group || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        restoreFocus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [group, busy, onClose, restoreFocus]);

  if (!group) return null;

  const closeWithFocus = () => {
    restoreFocus();
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.deleteGroup(group.id);
      toast({ kind: "ok", text: `Deleted group ${group.id}`, ttl: 3000 });
    } catch (err) {
      toast({
        kind: "err",
        text: `Failed to delete group ${group.id}`,
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
      data-testid="delete-group-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-group-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="delete-group-title">Delete group?</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delete group modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 12px" }}>
            About to delete <strong className="mono">{group.id}</strong>
            {group.name && (
              <>
                {" "}
                ({group.name}
                {group.type ? `, ${group.type}` : ""})
              </>
            )}
            .
          </p>
          <p className="mute" style={{ margin: 0, fontSize: 12 }}>
            This action is permanent. Deleting the group also removes all user-group memberships
            referencing it (engine cascade-deletes the join rows — verified live).
          </p>
        </div>
        <div className="modal-ft">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            data-testid="delete-group-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-group-submit"
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
