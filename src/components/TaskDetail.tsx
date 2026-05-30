// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /tasks/$id.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → "No variables." / "No form attached."
 *   - data     → property table + form (if any) + Claim/Complete + variables
 */

import { Link, useNavigate } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableTask, type FlowableTaskForm } from "../api";
import { fmtDue, fmtTime, Icon, PageHead, toast } from "../components";
import { DelegateTaskModal } from "../lib/delegate-task-modal";
import { EditTaskModal } from "../lib/edit-task-modal";
import { ErrorBox } from "../lib/error-box";
import { NAV_INVALIDATE_COUNTS } from "../lib/nav-events";
import { useApi } from "../lib/useApi";
import { TaskAttachmentsPanel } from "./TaskAttachmentsPanel";
import { TaskFormPanel } from "./TaskFormPanel";

interface Props {
  task: FlowableTask;
  reload: () => void;
}

type TaskWide = FlowableTask & {
  processDefinitionName?: string;
  processDefinitionKey?: string;
  candidateGroup?: string;
  description?: string;
  formKey?: string;
};

// Story 11.3 AC-9: hide the legacy Complete button when a form is present.
// The panel's Submit button replaces it; submitting a form atomically
// completes the task via `api.submitTaskForm`. Operators should not be able
// to bypass form validation by clicking Complete.
type ParentTaskForm = FlowableTaskForm | null;

export function TaskDetail({ task, reload }: Props) {
  const navigate = useNavigate();
  const t = task as TaskWide;

  const form = useApi<ParentTaskForm>(
    () => api.getTaskForm(t.id).catch(() => null) as Promise<ParentTaskForm>,
    [t.id],
  );
  // hasForm gates the legacy Complete button (AC-9). Flowable 7.2 returns a
  // truthy payload (e.g. `{ formKey: null }`) even for tasks without
  // declared form properties, so we additionally require non-empty
  // formProperties before considering the form "real" — otherwise the
  // operator loses access to the Complete button on no-form tasks.
  const hasForm = !!form.data?.formProperties && form.data.formProperties.length > 0;
  const variables = useApi(() => api.getTaskVariables(t.id), [t.id]);

  // Story 11.4: Delegate modal + Resolve handler state.
  const [delegateTarget, setDelegateTarget] = React.useState<FlowableTask | null>(null);
  const delegateButtonRef = React.useRef<HTMLButtonElement>(null);
  const [resolveBusy, setResolveBusy] = React.useState(false);

  // Story 21.1: Edit task modal state.
  const [editTarget, setEditTarget] = React.useState<FlowableTask | null>(null);
  const editButtonRef = React.useRef<HTMLButtonElement>(null);

  const cfgUsername = api.config().username?.trim() ?? "";
  // AC-5: Resolve is visible only when the operator is the delegated assignee
  // (assignee === cfg.username) AND the task has an owner who isn't the same.
  const canResolve =
    !!t.assignee && t.assignee === cfgUsername && !!t.owner && t.owner !== t.assignee;

  const claim = async () => {
    const cfg = api.config();
    await api.taskAction(t.id, "claim", { assignee: cfg.username });
    reload();
  };
  const complete = async () => {
    await api.taskAction(t.id, "complete");
    navigate({ to: "/tasks" });
  };

  // Story 11.4 AC-5: Resolve handler — one-shot, no input, toast on settle.
  const resolve = async () => {
    setResolveBusy(true);
    try {
      await api.taskAction(t.id, "resolve");
      toast({ kind: "ok", text: `Resolved: ${t.name || t.id}`, ttl: 3000 });
      window.dispatchEvent(new CustomEvent(NAV_INVALIDATE_COUNTS));
    } catch (err) {
      toast({
        kind: "err",
        text: "Resolve failed",
        sub: (err as Error)?.message ?? String(err),
        ttl: 8000,
      });
    } finally {
      setResolveBusy(false);
      // Engine is source of truth; reload regardless to converge.
      reload();
    }
  };

  return (
    <div className="page">
      <PageHead
        title={t.name || t.id}
        subtitle={`Created ${fmtTime(t.createTime)}${t.dueDate ? ` · due ${fmtDue(t.dueDate)}` : ""}`}
        actions={
          <>
            <Link to="/tasks" className="btn" data-variant="ghost">
              <Icon name="chevron" size={12} />
              Back
            </Link>
            {!t.assignee && (
              <button type="button" className="btn" data-variant="primary" onClick={claim}>
                Claim
              </button>
            )}
            {/* Story 11.3 AC-9: Complete button is hidden when a form is
                present — the form panel's Submit replaces it. */}
            {!hasForm && (
              <button
                type="button"
                className="btn"
                data-variant={t.assignee ? "primary" : "ghost"}
                onClick={complete}
              >
                Complete
              </button>
            )}
            {/* Story 11.4 AC-5: Resolve appears only when the operator is the
                delegated assignee and there's a distinct owner. */}
            {canResolve && (
              <button
                type="button"
                className="btn"
                data-variant="primary"
                data-testid="resolve-task"
                onClick={resolve}
                disabled={resolveBusy}
              >
                {resolveBusy ? "Resolving…" : "Resolve"}
              </button>
            )}
            <button
              ref={delegateButtonRef}
              type="button"
              className="btn"
              data-variant="ghost"
              onClick={() => setDelegateTarget(task)}
            >
              Delegate…
            </button>
            <button
              ref={editButtonRef}
              type="button"
              className="btn"
              data-variant="ghost"
              data-testid="edit-task"
              onClick={() => setEditTarget(task)}
            >
              Edit task…
            </button>
          </>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <span className="panel-title">Properties</span>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  Name
                </td>
                <td>{t.name || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">ID</td>
                <td className="mono">{t.id}</td>
              </tr>
              <tr>
                <td className="mute">Assignee</td>
                <td className="mono">
                  {t.assignee ||
                    (t.candidateGroup ? (
                      `group:${t.candidateGroup}`
                    ) : (
                      <span className="mute">unclaimed</span>
                    ))}
                </td>
              </tr>
              <tr>
                <td className="mute">Owner</td>
                <td className="mono">{t.owner || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Priority</td>
                <td className="mono">{t.priority}</td>
              </tr>
              <tr>
                <td className="mute">Due date</td>
                <td className="mono">
                  {t.dueDate ? fmtDue(t.dueDate) : <span className="mute">—</span>}
                </td>
              </tr>
              <tr>
                <td className="mute">Process instance</td>
                <td>
                  {t.processInstanceId ? (
                    <Link to="/instances/$id" params={{ id: t.processInstanceId }} className="mono">
                      {t.processInstanceId}
                    </Link>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
              </tr>
              <tr>
                <td className="mute">Process definition</td>
                <td className="mono">
                  {(t.processDefinitionName as string | undefined) ||
                    (t.processDefinitionKey as string | undefined) ||
                    "—"}
                </td>
              </tr>
              <tr>
                <td className="mute">Form key</td>
                <td className="mono">{t.formKey || <span className="mute">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <TaskFormPanel taskId={t.id} task={task} onSubmitted={() => navigate({ to: "/tasks" })} />

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Variables</span>
        </div>
        <div className="panel-body">
          {variables.loading && (
            <div className="empty" style={{ padding: 14 }}>
              Loading…
            </div>
          )}
          {variables.error && <ErrorBox error={variables.error} onRetry={variables.reload} />}
          {variables.data && variables.data.length === 0 && (
            <div className="empty">No variables.</div>
          )}
          {variables.data && variables.data.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {variables.data.map((v) => (
                <div
                  key={v.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                  }}
                >
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-soft)" }}>
                    {v.name}
                  </span>
                  <span className="mono" style={{ fontSize: 11.5 }}>
                    {typeof v.value === "string" ? `"${v.value}"` : String(v.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <TaskAttachmentsPanel taskId={t.id} />
      <DelegateTaskModal
        task={delegateTarget}
        triggerRef={delegateButtonRef}
        onClose={() => setDelegateTarget(null)}
        onSubmitted={() => {
          setDelegateTarget(null);
          reload();
        }}
      />
      <EditTaskModal
        task={editTarget}
        triggerRef={editButtonRef}
        onClose={() => setEditTarget(null)}
        onSuccess={() => {
          setEditTarget(null);
          reload();
        }}
      />
    </div>
  );
}
