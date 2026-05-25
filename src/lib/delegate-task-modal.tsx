// SPDX-License-Identifier: Apache-2.0

/**
 * Delegate-task modal (Story 11.4).
 *
 * Replaces 11.1's `Delegate…` placeholder on `/tasks` AND the legacy
 * `prompt("Delegate to whom?")` call in `<TaskDetail>`. Single-input
 * modal: one `<input type="text">` for the target username. Submitting
 * calls `api.taskAction(taskId, "delegate", { assignee })`.
 *
 * Reuses the `.modal-back` / `.modal` / `.modal-hd` / `.modal-bd` /
 * `.modal-ft` palette from 9.3 / 10.3 verbatim. Follows the retryable-
 * creation recipe (CLAUDE.md navigate-on-both vs in-modal-ErrorBox):
 * failure stays in the modal with an in-modal `<ErrorBox>` so the
 * operator can fix-and-resubmit without re-typing.
 *
 * Per Story 11.4 Project Structure Notes: `<DelegateTaskModal>` is the
 * fifth modal in the project but does NOT trigger `<ConfirmActionModal>`
 * extraction — it's retryable-creation (closer to `<StartInstanceModal>`),
 * not destructive-with-optional-input (closer to `<DeleteDeploymentModal>` /
 * `<CancelInstanceModal>`).
 */

import React from "react";
import { api, type FlowableTask } from "../api";
import { Icon, toast } from "../components";
import { ErrorBox } from "./error-box";
import { NAV_INVALIDATE_COUNTS } from "./nav-events";

export interface DelegateTaskModalProps {
  /** When null, the modal is closed. Pass a FlowableTask to open. */
  task: FlowableTask | null;
  onClose: () => void;
  /**
   * Fires AFTER a successful delegate API call so the parent can
   * invalidate / reload. Failure does NOT call onSubmitted — the modal
   * stays open so the operator can fix-and-resubmit (retryable-creation
   * pattern; mirrors 10.2's `StartInstanceModal`).
   */
  onSubmitted: () => void;
  /**
   * Focus-restore target per CLAUDE.md modal triggerRef convention.
   */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const DelegateTaskModal: React.FC<DelegateTaskModalProps> = ({
  task,
  onClose,
  onSubmitted,
  triggerRef,
}) => {
  const [target, setTarget] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<Error | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!task) return;
    setTarget("");
    setBusy(false);
    setSubmitError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [task]);

  React.useEffect(() => {
    if (!task || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [task, busy, onClose, triggerRef]);

  if (!task) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const trimmed = target.trim();
  const canSubmit = !busy && trimmed.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitError(null);
    setBusy(true);
    try {
      await api.taskAction(task.id, "delegate", { assignee: trimmed });
      toast({
        kind: "ok",
        text: `Delegated: ${task.name || task.id} → ${trimmed}`,
        ttl: 3000,
      });
      window.dispatchEvent(new CustomEvent(NAV_INVALIDATE_COUNTS));
      onSubmitted();
      setBusy(false);
      closeWithFocus();
    } catch (err) {
      setSubmitError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="delegate-task-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-hd">
          <h3>Delegate task</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close delegate modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 4px" }}>
            Task: <strong>{task.name || task.id}</strong>
          </p>
          <p className="mute" style={{ margin: "0 0 16px", fontSize: 12 }}>
            Currently assigned to: <span className="mono">{task.assignee || "(unassigned)"}</span>
          </p>
          <label
            htmlFor="delegate-task-input"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Delegate to
          </label>
          <input
            ref={inputRef}
            id="delegate-task-input"
            type="text"
            className="input"
            data-testid="delegate-task-input"
            placeholder="username"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            style={{ width: "100%" }}
          />
          {submitError && (
            <div data-testid="delegate-task-error" style={{ marginTop: 12 }}>
              <ErrorBox error={submitError} />
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="delegate-task-modal-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="delegate-task-modal-confirm"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {busy ? "Delegating…" : "Delegate"}
          </button>
        </div>
      </div>
    </div>
  );
};
