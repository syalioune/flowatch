// SPDX-License-Identifier: Apache-2.0

/**
 * Delete-user confirmation modal (Story 22.2) — 22nd modal in the catalogue,
 * 6th `alertdialog` instance.
 *
 * One-shot destructive archetype — mirrors `<DeleteVariableModal>` / `<Delete
 * DeploymentModal>`. Closes on BOTH success and failure; the outcome is
 * carried by a toast. Navigate-on-both per CLAUDE.md "Modal conventions
 * decision matrix" — the user-detail page is gone after delete; the list-
 * page state-of-the-world is the source of truth.
 *
 * FIRST CROSS-DOMAIN consumer of Story 19.2's `fallbackRef` pattern — the
 * trigger button lives inside `<UserDetail>`'s PageHead actions; on
 * successful delete the parent navigates to `/identity` and `<UserDetail>`
 * unmounts, so `triggerRef.current` becomes detached. `fallbackRef` points
 * at a stable element (Back link survives in the page chrome long enough on
 * cancel/failure; navigate-on-success collapses the focus chain to body
 * naturally — the silent-no-op clause). Closes the Epic 19 retro AI-1
 * forward-reference.
 *
 * ARIA convention (Epic 18.2): role="alertdialog" + aria-modal + aria-
 * labelledby on day one.
 */

import React from "react";
import { api, type FlowableUser } from "../api";
import { Icon, toast } from "../components";

export interface DeleteUserModalProps {
  /** When null, the modal is closed. Pass a user to open. */
  user: FlowableUser | null;
  onClose: () => void;
  /** Fired after the request settles (success OR failure). Parent navigates. */
  onSettled: () => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  /**
   * Fallback focus target when triggerRef.current is detached at close time
   * (UserDetail unmounts on navigate). FIRST CROSS-DOMAIN consumer of the
   * Story 19.2 pattern (identity, not runtime-variables).
   */
  fallbackRef?: React.RefObject<HTMLElement | null>;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  user,
  onClose,
  onSettled,
  triggerRef,
  fallbackRef,
}) => {
  const [busy, setBusy] = React.useState(false);
  const cancelRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!user) return;
    setBusy(false);
    setTimeout(() => cancelRef.current?.focus(), 0);
  }, [user]);

  const restoreFocus = React.useCallback(() => {
    const trigger = triggerRef?.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
      return;
    }
    fallbackRef?.current?.focus();
  }, [triggerRef, fallbackRef]);

  React.useEffect(() => {
    if (!user || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        restoreFocus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [user, busy, onClose, restoreFocus]);

  if (!user) return null;

  const closeWithFocus = () => {
    restoreFocus();
    onClose();
  };

  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

  const submit = async () => {
    setBusy(true);
    try {
      await api.deleteUser(user.id);
      toast({ kind: "ok", text: `Deleted user ${user.id}`, ttl: 3000 });
    } catch (err) {
      toast({
        kind: "err",
        text: `Failed to delete user ${user.id}`,
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
      data-testid="delete-user-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-user-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="delete-user-title">Delete user?</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delete user modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 12px" }}>
            About to delete <strong className="mono">{user.id}</strong>
            {fullName && (
              <>
                {" "}
                ({fullName}
                {user.email ? `, ${user.email}` : ""})
              </>
            )}
            .
          </p>
          <p className="mute" style={{ margin: 0, fontSize: 12 }}>
            This action is permanent. The user is removed from the engine; any group memberships,
            candidate-user bindings, and task assignments referencing this user become dangling
            references (the engine does NOT cascade-delete them — verified live in T-10 probe).
          </p>
        </div>
        <div className="modal-ft">
          <button
            ref={cancelRef}
            type="button"
            className="btn"
            data-testid="delete-user-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="danger-strong"
            data-testid="delete-user-submit"
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
