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
import { api, type FlowableTask, type FlowableTaskForm } from "../api";
import { fmtDue, fmtTime, Icon, PageHead } from "../components";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";
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
  const hasForm = !!form.data;
  const variables = useApi(() => api.getTaskVariables(t.id), [t.id]);

  const claim = async () => {
    const cfg = api.config();
    await api.taskAction(t.id, "claim", { assignee: cfg.username });
    reload();
  };
  const complete = async () => {
    await api.taskAction(t.id, "complete");
    navigate({ to: "/tasks" });
  };
  const delegate = async () => {
    const assignee = prompt("Delegate to whom?");
    if (!assignee) return;
    await api.taskAction(t.id, "delegate", { assignee });
    reload();
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
            <button type="button" className="btn" data-variant="ghost" onClick={delegate}>
              Delegate…
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
                <td className="mute">Priority</td>
                <td className="mono">{t.priority}</td>
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
    </div>
  );
}
