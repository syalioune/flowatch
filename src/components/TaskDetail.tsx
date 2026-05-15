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
import { api, type FlowableTask } from "../api";
import { fmtDue, fmtTime, Icon, PageHead } from "../components";
import DATA from "../data";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

interface Props {
  task: FlowableTask;
  onOpenInspector?: () => void;
  reload: () => void;
}

type TaskWide = FlowableTask & {
  processDefinitionName?: string;
  processDefinitionKey?: string;
  candidateGroup?: string;
  description?: string;
  formKey?: string;
};

type FormFieldEnumValue = string | { id?: string; name?: string };
interface FormField {
  id: string;
  name?: string;
  required?: boolean;
  type: string;
  value?: string;
  enumValues?: FormFieldEnumValue[];
}
type TaskForm = { formKey?: string; formProperties?: FormField[] } | null;

export function TaskDetail({ task, onOpenInspector, reload }: Props) {
  const navigate = useNavigate();
  const t = task as TaskWide;

  const form = useApi<TaskForm>(
    () => api.getTaskForm(t.id).catch(() => null) as Promise<TaskForm>,
    [t.id],
  );
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
        endpoints={DATA.endpoints.tasks}
        onOpenInspector={onOpenInspector ? () => onOpenInspector() : undefined}
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
            <button
              type="button"
              className="btn"
              data-variant={t.assignee ? "primary" : "ghost"}
              onClick={complete}
            >
              Complete
            </button>
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

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Form</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /form/form-data?taskId={t.id}
          </span>
        </div>
        <div className="panel-body">
          {form.loading && (
            <div className="empty" style={{ padding: 14 }}>
              Loading…
            </div>
          )}
          {form.error && <ErrorBox error={form.error} onRetry={form.reload} />}
          {!form.loading && !form.error && !form.data && (
            <div className="mute" style={{ padding: "8px 0" }}>
              No form attached to this task.
            </div>
          )}
          {form.data && (
            <div style={{ maxWidth: 560 }}>
              <div className="mono text-xs mute" style={{ marginBottom: 8 }}>
                formKey: {form.data.formKey || "—"}
              </div>
              {(form.data.formProperties || []).map((f) => (
                <div className="form-row" key={f.id}>
                  <label htmlFor={`f-${f.id}`}>
                    {f.name || f.id} {f.required && <span className="req">*</span>}
                    <span className="mono">{f.type}</span>
                  </label>
                  {f.type === "enum" && Array.isArray(f.enumValues) && (
                    <div className="seg-row">
                      {f.enumValues.map((v) => {
                        const key = typeof v === "string" ? v : v.id || v.name || "";
                        const lbl = typeof v === "string" ? v : v.name || v.id || "";
                        return (
                          <button type="button" key={key} className="seg-btn">
                            {lbl}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {f.type !== "enum" && (
                    <input id={`f-${f.id}`} className="input" defaultValue={f.value || ""} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
