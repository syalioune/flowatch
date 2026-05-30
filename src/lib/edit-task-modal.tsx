// SPDX-License-Identifier: Apache-2.0

/**
 * Edit-task modal (Story 21.1) — 17th modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<EditCategoryModal>` (Story 20.1)
 * scaled from 1 field to 4 fields (priority / dueDate / owner / assignee).
 * Empty Priority is INVALID (non-nullable per Flowable); empty string fields
 * + cleared dueDate are ALLOWED (submitted as `null` to clear).
 *
 * Diff-empty no-op guard (AC-8): the modal computes a diff between current
 * inputs and the task's current values; Save is disabled when no field
 * changed. Once the operator interacts and reverts the change, a mute hint
 * "No changes to save." reveals.
 *
 * `<input type="datetime-local">` local→UTC ISO-8601 round-trip per
 * Story 12.2 codification — `toLocalInputValue` helper is duplicated inline
 * from `reschedule-timer-modal.tsx:40-46` (N=2 consumer; extraction trigger
 * is N=3 per CLAUDE.md "Three similar lines is better than a premature
 * abstraction").
 *
 * ARIA convention (Epic 18.2): role="dialog" + aria-modal + aria-labelledby
 * on day one.
 *
 * The PUT funnels through `api.updateTask` — same wire URL as
 * `api.taskAction`, distinct operator-feel + HTTP method (POST action-verbs
 * vs PUT field-patches; see the wrapper's JSDoc + CLAUDE.md "Operator-feel
 * UI labels can diverge from wire-level action verbs", Story 12.2
 * codification).
 */

import React from "react";
import { api, type FlowableTask } from "../api";
import { Icon } from "../components";
import { ErrorBox } from "./error-box";

export interface EditTaskModalProps {
  /** When null, the modal is closed. Pass a task to open. */
  task: FlowableTask | null;
  onClose: () => void;
  /** Fired after a successful PUT. Parent reloads the detail route here. */
  onSuccess?: () => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

// Duplicated inline from `reschedule-timer-modal.tsx:40-46` per CLAUDE.md
// "Three similar lines is better than a premature abstraction" — N=2.
// Extraction to `src/lib/datetime-local.ts` triggers at N=3.
const toLocalInputValue = (iso: string | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Inputs = {
  priority: string;
  dueDate: string;
  owner: string;
  assignee: string;
};

const initialInputs = (task: FlowableTask): Inputs => ({
  priority: String(task.priority ?? 50),
  dueDate: toLocalInputValue(task.dueDate),
  owner: task.owner ?? "",
  assignee: task.assignee ?? "",
});

// Build the diff payload for `api.updateTask` from current inputs vs task.
// Returns only the fields whose value differs from the task's current value;
// empty strings on nullable fields collapse to `null` (clear semantic).
type UpdatePayload = Partial<{
  priority: number;
  dueDate: string | null;
  owner: string | null;
  assignee: string | null;
}>;

const computeDiff = (inputs: Inputs, task: FlowableTask): UpdatePayload => {
  const diff: UpdatePayload = {};
  const nextPriority = Number(inputs.priority);
  if (Number.isFinite(nextPriority) && nextPriority !== task.priority) {
    diff.priority = nextPriority;
  }
  const currentLocalDue = toLocalInputValue(task.dueDate);
  if (inputs.dueDate !== currentLocalDue) {
    if (inputs.dueDate === "") {
      diff.dueDate = null;
    } else {
      const d = new Date(inputs.dueDate);
      if (!Number.isNaN(d.getTime())) diff.dueDate = d.toISOString();
    }
  }
  const currentOwner = task.owner ?? "";
  if (inputs.owner !== currentOwner) {
    diff.owner = inputs.owner === "" ? null : inputs.owner;
  }
  const currentAssignee = task.assignee ?? "";
  if (inputs.assignee !== currentAssignee) {
    diff.assignee = inputs.assignee === "" ? null : inputs.assignee;
  }
  return diff;
};

export const EditTaskModal: React.FC<EditTaskModalProps> = ({
  task,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [inputs, setInputs] = React.useState<Inputs>(() =>
    task ? initialInputs(task) : { priority: "50", dueDate: "", owner: "", assignee: "" },
  );
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pristine, setPristine] = React.useState(true);
  const priorityRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!task) return;
    setInputs(initialInputs(task));
    setError(null);
    setBusy(false);
    setPristine(true);
    setTimeout(() => priorityRef.current?.focus(), 0);
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

  const diff = React.useMemo(
    () => (task ? computeDiff(inputs, task) : ({} as UpdatePayload)),
    [inputs, task],
  );

  if (!task) return null;

  const priorityEmpty = inputs.priority.trim() === "";
  const diffEmpty = Object.keys(diff).length === 0;
  const canSave = !busy && !priorityEmpty && !diffEmpty;

  const setField = <K extends keyof Inputs>(key: K, value: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setPristine(false);
  };

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    setBusy(true);
    try {
      await api.updateTask(task.id, diff);
      setBusy(false);
      onSuccess?.();
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
      data-testid="edit-task-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-task-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
      >
        <div className="modal-hd">
          <h3 id="edit-task-title">Edit task</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-disabled={busy}
            aria-label="Close edit task modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) submit();
          }}
        >
          <div className="modal-bd">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox error={error} />
              </div>
            )}
            <p className="mute" style={{ margin: "0 0 12px", fontSize: 12 }}>
              Editing <span className="mono">{task.name || task.id}</span> (id:{" "}
              <span className="mono">{task.id}</span>)
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="edit-task-priority"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Priority
                </label>
                <input
                  ref={priorityRef}
                  id="edit-task-priority"
                  data-testid="edit-task-priority"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  required
                  value={inputs.priority}
                  onChange={(e) => setField("priority", e.target.value)}
                  disabled={busy}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-task-due-date"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Due date
                </label>
                <input
                  id="edit-task-due-date"
                  data-testid="edit-task-due-date"
                  type="datetime-local"
                  value={inputs.dueDate}
                  onChange={(e) => setField("dueDate", e.target.value)}
                  disabled={busy}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
                <p className="mute" style={{ margin: "4px 0 0", fontSize: 11 }}>
                  Leave empty to clear the due date.
                </p>
              </div>
              <div>
                <label
                  htmlFor="edit-task-owner"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Owner
                </label>
                <input
                  id="edit-task-owner"
                  data-testid="edit-task-owner"
                  type="text"
                  value={inputs.owner}
                  onChange={(e) => setField("owner", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="edit-task-assignee"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Assignee
                </label>
                <input
                  id="edit-task-assignee"
                  data-testid="edit-task-assignee"
                  type="text"
                  value={inputs.assignee}
                  onChange={(e) => setField("assignee", e.target.value)}
                  disabled={busy}
                  maxLength={255}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
            </div>
            {!pristine && diffEmpty && !priorityEmpty && (
              <p
                className="mute"
                data-testid="edit-task-no-changes"
                style={{ margin: "10px 0 0", fontSize: 11 }}
              >
                No changes to save.
              </p>
            )}
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="edit-task-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="edit-task-submit"
              disabled={!canSave}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
