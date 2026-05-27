// SPDX-License-Identifier: Apache-2.0

/**
 * Reschedule-timer modal (Story 12.2 review patch).
 *
 * Pairs with the timer-tab `Execute now` action on `/jobs?type=timer`.
 * Execute moves the timer to executable for immediate async firing;
 * Reschedule changes the timer's dueDate to a future moment.
 *
 * Mirrors `<DelegateTaskModal>` shape — single-input retryable-creation
 * recipe (in-modal ErrorBox on failure so the operator can fix-and-resubmit
 * without re-entering the dueDate).
 *
 * Wire: POST /management/timer-jobs/{id} with `{action: "reschedule",
 * dueDate: <iso>}`. The `<input type="datetime-local">` value is local-time;
 * we convert to ISO-8601 UTC (`new Date(value).toISOString()`) before send.
 */

import React from "react";
import { api, type FlowableJob } from "../api";
import { Icon, toast } from "../components";
import { ErrorBox } from "./error-box";

export interface RescheduleTimerModalProps {
  /** When null, the modal is closed. Pass a FlowableJob to open. */
  job: FlowableJob | null;
  onClose: () => void;
  /**
   * Fires AFTER a successful reschedule so the parent can invalidate.
   * Failure does NOT call onSubmitted (retryable-creation pattern).
   */
  onSubmitted: () => void;
  /** Focus-restore target per CLAUDE.md modal triggerRef convention. */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// Convert an ISO-8601 string (engine's `dueDate`) to the value shape
// expected by `<input type="datetime-local">` — `YYYY-MM-DDTHH:MM` in
// the user's LOCAL timezone. Returns "" on bad input.
const toLocalInputValue = (iso: string | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const RescheduleTimerModal: React.FC<RescheduleTimerModalProps> = ({
  job,
  onClose,
  onSubmitted,
  triggerRef,
}) => {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<Error | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!job) return;
    setValue(toLocalInputValue(job.dueDate));
    setBusy(false);
    setSubmitError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [job]);

  React.useEffect(() => {
    if (!job || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [job, busy, onClose, triggerRef]);

  if (!job) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  // The datetime-local input emits "YYYY-MM-DDTHH:MM" in LOCAL time. We
  // round-trip through Date so the engine receives an ISO-8601 UTC value
  // (`.toISOString()`). Empty / unparseable values disable Submit.
  const parsed = value ? new Date(value) : null;
  const canSubmit =
    !busy && parsed !== null && !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();

  const submit = async () => {
    if (!canSubmit || !parsed) return;
    setSubmitError(null);
    setBusy(true);
    try {
      const dueDate = parsed.toISOString();
      await api.rescheduleTimerJob(job.id, dueDate);
      toast({ kind: "ok", text: `Rescheduled: ${job.id}`, ttl: 3000 });
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
      data-testid="reschedule-timer-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel only intercepts the backdrop click; child buttons own interactivity */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reschedule-timer-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 440 }}
      >
        <div className="modal-hd">
          <h3 id="reschedule-timer-title">Reschedule timer</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close reschedule modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <p style={{ margin: "0 0 4px" }}>
            Timer: <strong className="mono">{job.id}</strong>
          </p>
          <p className="mute" style={{ margin: "0 0 16px", fontSize: 12 }}>
            Currently fires at: <span className="mono">{job.dueDate || "—"}</span>
          </p>
          <label
            htmlFor="reschedule-timer-input"
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            New due date (local time)
          </label>
          <input
            ref={inputRef}
            id="reschedule-timer-input"
            type="datetime-local"
            className="input"
            data-testid="reschedule-timer-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            style={{ width: "100%" }}
          />
          {submitError && (
            <div data-testid="reschedule-timer-error" style={{ marginTop: 12 }}>
              <ErrorBox error={submitError} />
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button
            type="button"
            className="btn"
            data-testid="reschedule-timer-modal-cancel"
            onClick={closeWithFocus}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            data-variant="primary"
            data-testid="reschedule-timer-modal-confirm"
            onClick={() => void submit()}
            disabled={!canSubmit}
          >
            {busy ? "Rescheduling…" : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
};
