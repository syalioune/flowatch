import { useNavigate } from "@tanstack/react-router";
import React from "react";
import {
  api,
  type FlowableJob,
  type FlowableProcessDefinition,
  type FlowableProcessInstance,
} from "./api";
import { fmtDue, fmtTime, Icon, PageHead, toast } from "./components";
import DATA, { type EndpointHint } from "./data";
import { ErrorBox } from "./lib/error-box";
import { useApi } from "./lib/useApi";

// Re-export ErrorBox at the original public path so tests that imported it
// from "../../screens" (Story 2.2) continue to compile.
export { ErrorBox };

// The Flowable REST DTOs in src/api.ts are deliberately minimal — they cover
// only the fields the type-checker can verify exist on every response. Some
// screens consume additional fields (e.g. processDefinitionName, activityId,
// jobType, elementId) that Flowable returns but api.ts doesn't declare. To
// avoid widening api.ts (which is Story 1.1's domain), we cast inline to
// `Loose<T>` at the use site. Cross-epic flag: see Dev Agent Record.
type Loose<T> = T & Record<string, unknown>;

type RuntimeJob = Loose<FlowableJob>;
type RuntimeInstance = Loose<FlowableProcessInstance>;

interface StartProcessPayload {
  businessKey?: string;
  variables?: Array<{ name: string; type: string; value: unknown }>;
}

interface ScreenProps {
  onOpenInspector?: ((e: EndpointHint) => void) | undefined;
}
interface NavScreenProps extends ScreenProps {
  onNav: (view: string) => void;
}
interface TenantsScreenProps extends ScreenProps {
  tenants?: { id: string; name: string }[];
}

const EmptyRow = ({ cols, msg = "No records." }: { cols: number; msg?: string }) => (
  <tr>
    <td colSpan={cols} className="empty" style={{ padding: 24 }}>
      {msg}
    </td>
  </tr>
);

const fmtMs = (ms: number | null | undefined): string => {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 1) return `${ms}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(0)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

const stateOf = (pi: { suspended?: boolean; ended?: boolean }): string =>
  pi.suspended ? "suspended" : pi.ended ? "ended" : "active";

// ── Dashboard ────────────────────────────────────────────────────────
export const Dashboard = ({ onOpenInspector, onNav }: NavScreenProps) => {
  const eps = DATA.endpoints.dashboard;
  const instances = useApi(
    () => api.listProcessInstances({ size: 8, sort: "startTime", order: "desc" }),
    [],
  );
  const tasks = useApi(() => api.listTasks({ size: 0 }), []);
  const failingJobs = useApi(() => api.listJobs({ withException: true, size: 5 }), []);
  const deadLetter = useApi(
    () => api.listDeadLetterJobs({ size: 0 }).catch(() => ({ total: 0 })),
    [],
  );
  const definitions = useApi(() => api.listProcessDefinitions({ size: 1000 }), []);

  const runningCount = instances.data?.total ?? "—";
  const taskCount = tasks.data?.total ?? "—";
  const failingCount = (failingJobs.data?.total ?? 0) + (deadLetter.data?.total ?? 0);

  // top definitions: count instances per definition key
  const topDefs = React.useMemo(() => {
    if (!definitions.data?.data) return [];
    return definitions.data.data.map((d) => ({ ...d, key: d.key })).slice(0, 6);
  }, [definitions.data]);

  return (
    <div className="page">
      <PageHead
        title="Overview"
        subtitle="Engine health, runtime activity, and what needs your attention."
        endpoints={eps}
        onOpenInspector={onOpenInspector}
      />
      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-lbl">Running instances</div>
          <div className="kpi-val">{runningCount}</div>
          <div className="kpi-delta">live count</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Open tasks</div>
          <div className="kpi-val">{taskCount}</div>
          <div className="kpi-delta">across all assignees</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Failing jobs</div>
          <div className="kpi-val" style={{ color: failingCount ? "var(--bad)" : "var(--fg)" }}>
            {failingCount}
          </div>
          <div className="kpi-delta">jobs + deadletter</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Process definitions</div>
          <div className="kpi-val">{definitions.data?.total ?? "—"}</div>
          <div className="kpi-delta">deployed</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
        <div className="panel">
          <div className="panel-hd">
            <span className="panel-title">Recent process instances</span>
            <span
              className="mono"
              style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
            >
              GET /runtime/process-instances
            </span>
            <button
              className="btn"
              data-size="sm"
              data-variant="ghost"
              onClick={() => onNav("instances")}
            >
              View all
            </button>
          </div>
          <div style={{ overflow: "auto" }}>
            <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
              <thead>
                <tr>
                  <th>Business key</th>
                  <th>Definition</th>
                  <th>Activity</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {instances.loading && <EmptyRow cols={5} msg="Loading…" />}
                {instances.error && (
                  <EmptyRow cols={5} msg={String(instances.error.message || instances.error)} />
                )}
                {!instances.loading &&
                  !instances.error &&
                  (instances.data?.data || []).length === 0 && (
                    <EmptyRow cols={5} msg="No running instances." />
                  )}
                {(instances.data?.data || []).slice(0, 6).map((p0) => {
                  const p = p0 as Loose<typeof p0>;
                  return (
                    <tr key={p0.id}>
                      <td className="mono">{p0.businessKey || p0.id}</td>
                      <td>{(p.processDefinitionName as string) || p0.processDefinitionKey}</td>
                      <td className="soft">{(p.activityId as string) || "—"}</td>
                      <td className="mute mono">{fmtTime(p0.startTime)}</td>
                      <td>
                        <span
                          className="badge"
                          data-tone={stateOf(p0) === "active" ? "ok" : "warn"}
                        >
                          <span className="dot" />
                          {stateOf(p0)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <span className="panel-title">Failing jobs</span>
            <span
              className="mono"
              style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
            >
              GET /management/jobs?withException=true
            </span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {failingJobs.loading && (
              <div className="empty" style={{ padding: 20 }}>
                Loading…
              </div>
            )}
            {failingJobs.error && <ErrorBox error={failingJobs.error} />}
            {failingJobs.data &&
              ((failingJobs.data.data || []) as RuntimeJob[]).map((j) => (
                <div
                  key={j.id}
                  style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="badge" data-tone="bad">
                      <span className="dot" />
                      {(j.jobType as string | undefined) || "job"}
                    </span>
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--fg-mute)" }}>
                      {j.id}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg-mute)" }}>
                      retries: {j.retries}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: 11, marginTop: 6, color: "var(--bad)" }}>
                    {j.exceptionMessage || "—"}
                  </div>
                  <div
                    className="mono"
                    style={{ fontSize: 10.5, marginTop: 4, color: "var(--fg-mute)" }}
                  >
                    {j.elementId ? `${j.elementId as string} · ` : ""}pi:
                    {j.processInstanceId || "—"}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button
                      className="btn"
                      data-size="sm"
                      onClick={() => api.executeJob(j.id).then(failingJobs.reload)}
                    >
                      <Icon name="refresh" size={11} />
                      Retry
                    </button>
                  </div>
                </div>
              ))}
            {failingJobs.data && (failingJobs.data.data || []).length === 0 && (
              <div className="empty">All clear.</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Process definitions</span>
          <button
            className="btn"
            data-size="sm"
            data-variant="ghost"
            style={{ marginLeft: "auto" }}
            onClick={() => onNav("definitions")}
          >
            View all
          </button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {definitions.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {definitions.error && <ErrorBox error={definitions.error} />}
          {topDefs.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid var(--line)",
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.name || d.key}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                  v{d.version} · {d.key}
                </div>
              </div>
              <span className="badge" data-tone={d.suspended ? "warn" : "ok"}>
                <span className="dot" />
                {d.suspended ? "suspended" : "active"}
              </span>
            </div>
          ))}
          {definitions.data && (definitions.data.data || []).length === 0 && (
            <div className="empty">No process definitions deployed.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Deployments ───────────────────────────────────────────────────
export const Deployments = ({ onOpenInspector }: ScreenProps) => {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState("");
  const deployments = useApi(
    () => api.listDeployments({ size: 200, sort: "deployTime", order: "desc" }),
    [],
  );
  const rows = (deployments.data?.data || []).filter(
    (d) =>
      !filter ||
      (d.name || "").toLowerCase().includes(filter.toLowerCase()) ||
      (d.category || "").toLowerCase().includes(filter.toLowerCase()) ||
      (d.tenantId || "").toLowerCase().includes(filter.toLowerCase()),
  );
  const remove = async (id: string) => {
    if (!confirm("Delete deployment? Cascading will remove instances too.")) return;
    await api.deleteDeployment(id, true);
    deployments.reload();
  };
  const openDetail = (id: string) => navigate({ to: "/deployments/$id", params: { id } });
  return (
    <div className="page">
      <PageHead
        title="Deployments"
        subtitle="Every BAR / BPMN / DMN deployed to this engine."
        endpoints={DATA.endpoints.deployments}
        onOpenInspector={onOpenInspector}
        actions={
          <>
            <button className="btn" onClick={deployments.reload}>
              <Icon name="refresh" size={13} />
              Refresh
            </button>
          </>
        }
      />
      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <div className="search-mini">
            <Icon name="search" size={12} />
            <input
              placeholder="Filter by name, category, tenant…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span className="mute mono text-xs" style={{ marginLeft: "auto" }}>
            {rows.length} of {deployments.data?.total ?? 0}
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
              <th>Category</th>
              <th>Tenant</th>
              <th>Deployed</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deployments.loading && <EmptyRow cols={6} msg="Loading…" />}
            {deployments.error && (
              <EmptyRow cols={6} msg={String(deployments.error.message || deployments.error)} />
            )}
            {!deployments.loading && !deployments.error && rows.length === 0 && (
              <EmptyRow cols={6} msg="No deployments match." />
            )}
            {rows.map((d) => (
              <tr
                key={d.id}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                onClick={() => openDetail(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(d.id);
                }}
              >
                <td>
                  <b style={{ fontWeight: 500 }}>{d.name || "—"}</b>
                </td>
                <td className="mono mute">{d.id}</td>
                <td>
                  {d.category ? (
                    <span className="badge" data-tone="neutral">
                      {d.category}
                    </span>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
                <td className="mute mono">{fmtTime(d.deploymentTime)}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    data-size="sm"
                    data-variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(d.id);
                    }}
                    title="Delete (cascade)"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Process Definitions ─────────────────────────────────────────
export const ProcessDefinitions = ({ onOpenInspector, onNav }: NavScreenProps) => {
  const navigate = useNavigate();
  const [showSuspended, setShowSuspended] = React.useState(true);
  const [startingId, setStartingId] = React.useState<string | null>(null);
  const [startDialog, setStartDialog] = React.useState<FlowableProcessDefinition | null>(null);
  const definitions = useApi(() => api.listProcessDefinitions({ size: 200, sort: "name" }), []);
  const rows = (definitions.data?.data || []).filter((d) => showSuspended || !d.suspended);
  const openDetail = (id: string) => navigate({ to: "/definitions/$id", params: { id } });

  const toggle = async (d: FlowableProcessDefinition) => {
    await api.suspendProcessDefinition(d.id, !d.suspended);
    definitions.reload();
  };
  const launch = async (d: FlowableProcessDefinition, payload: StartProcessPayload) => {
    setStartingId(d.id);
    try {
      const r = await api.startProcessInstance({ processDefinitionId: d.id, ...payload });
      const action = onNav
        ? { label: "View instances", onClick: () => onNav("instances") }
        : undefined;
      toast({
        kind: "ok",
        text: `Started ${d.name || d.key}`,
        ...(r?.id ? { sub: `instance ${r.id}` } : {}),
        ...(action ? { action } : {}),
      });
      setStartDialog(null);
    } catch (e) {
      toast({ kind: "err", text: `Start failed: ${(e as Error)?.message || e}`, ttl: 8000 });
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="page">
      <PageHead
        title="Process definitions"
        subtitle="Models that have been deployed. Click a row to inspect, suspend, or start an instance."
        endpoints={DATA.endpoints.definitions}
        onOpenInspector={onOpenInspector}
      />
      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <button className="btn" data-size="sm" data-variant="ghost" onClick={definitions.reload}>
            <Icon name="refresh" size={12} />
            Refresh
          </button>
          <button
            className="btn"
            data-size="sm"
            data-variant={showSuspended ? "primary" : "ghost"}
            onClick={() => setShowSuspended((v) => !v)}
          >
            {showSuspended ? "Hide suspended" : "Show suspended"}
          </button>
          <span className="mute mono text-xs" style={{ marginLeft: "auto" }}>
            {rows.length} of {definitions.data?.total ?? 0}
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Definition</th>
              <th>Key</th>
              <th>Version</th>
              <th>Status</th>
              <th>Tenant</th>
              <th>Category</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {definitions.loading && <EmptyRow cols={7} msg="Loading…" />}
            {definitions.error && (
              <EmptyRow cols={7} msg={String(definitions.error.message || definitions.error)} />
            )}
            {!definitions.loading && !definitions.error && rows.length === 0 && (
              <EmptyRow cols={7} msg="No process definitions." />
            )}
            {rows.map((d) => (
              <tr
                key={d.id}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                onClick={() => openDetail(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(d.id);
                }}
              >
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="bpmn" size={14} />
                    <b style={{ fontWeight: 500 }}>{d.name || d.key}</b>
                  </div>
                </td>
                <td className="mono">{d.key}</td>
                <td className="mono">v{d.version}</td>
                <td>
                  <span className="badge" data-tone={d.suspended ? "warn" : "ok"}>
                    <span className="dot" />
                    {d.suspended ? "suspended" : "active"}
                  </span>
                </td>
                <td className="mono">{d.tenantId || <span className="mute">—</span>}</td>
                <td>
                  {d.category ? (
                    <span className="badge" data-tone="neutral">
                      {d.category}
                    </span>
                  ) : (
                    <span className="mute">—</span>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn"
                      data-size="sm"
                      disabled={startingId === d.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStartDialog(d);
                      }}
                    >
                      <Icon name="play" size={11} />
                      {startingId === d.id ? "Starting…" : "Start"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-size="sm"
                      data-variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(d);
                      }}
                    >
                      {d.suspended ? "Activate" : "Suspend"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {startDialog && (
        <StartProcessDialog
          definition={startDialog}
          busy={startingId === startDialog.id}
          onCancel={() => setStartDialog(null)}
          onStart={(payload) => launch(startDialog, payload)}
        />
      )}
    </div>
  );
};

const VAR_TYPES = ["string", "integer", "double", "boolean", "json"];

interface VarRow {
  name: string;
  type: string;
  value: string;
}

interface StartProcessDialogProps {
  definition: FlowableProcessDefinition;
  busy: boolean;
  onCancel: () => void;
  onStart: (payload: StartProcessPayload) => void;
}

const StartProcessDialog = ({ definition, busy, onCancel, onStart }: StartProcessDialogProps) => {
  const [businessKey, setBusinessKey] = React.useState("");
  const [vars, setVars] = React.useState<VarRow[]>([{ name: "", type: "string", value: "" }]);
  const [parseError, setParseError] = React.useState<string | null>(null);

  const addRow = () => setVars((xs) => [...xs, { name: "", type: "string", value: "" }]);
  const removeRow = (i: number) => setVars((xs) => xs.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<VarRow>) =>
    setVars((xs) => xs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const coerce = (v: VarRow): { value: unknown; type: string } => {
    if (v.type === "integer") return { value: parseInt(v.value, 10), type: "integer" };
    if (v.type === "double") return { value: parseFloat(v.value), type: "double" };
    if (v.type === "boolean") return { value: v.value === "true", type: "boolean" };
    if (v.type === "json") return { value: JSON.parse(v.value), type: "json" };
    return { value: v.value, type: "string" };
  };

  const submit = () => {
    setParseError(null);
    const payload: StartProcessPayload = {};
    if (businessKey.trim()) payload.businessKey = businessKey.trim();
    const named = vars.filter((v) => v.name.trim());
    if (named.length) {
      try {
        payload.variables = named.map((v) => {
          const c = coerce(v);
          if (v.type === "integer" && Number.isNaN(c.value))
            throw new Error(`'${v.name}' is not an integer`);
          if (v.type === "double" && Number.isNaN(c.value))
            throw new Error(`'${v.name}' is not a number`);
          return { name: v.name.trim(), value: c.value, type: c.type };
        });
      } catch (e) {
        setParseError(String((e as Error)?.message || e));
        return;
      }
    }
    onStart(payload);
  };

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        <div className="modal-hd">
          <h3>Start {definition.name || definition.key}</h3>
          <button className="icon-btn" onClick={onCancel} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        </div>
        <div className="modal-bd">
          <div className="form-row">
            <label>
              Business key <span className="mono">optional</span>
            </label>
            <input
              className="input"
              value={businessKey}
              placeholder="e.g. order-1042"
              onChange={(e) => setBusinessKey(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Variables</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {vars.map((v, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 110px 1.4fr 28px", gap: 6 }}
                >
                  <input
                    className="input mono"
                    placeholder="name"
                    value={v.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                  />
                  <select
                    className="select"
                    value={v.type}
                    onChange={(e) => updateRow(i, { type: e.target.value })}
                  >
                    {VAR_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {v.type === "boolean" ? (
                    <select
                      className="select"
                      value={v.value || "false"}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      className="input mono"
                      placeholder={v.type === "json" ? '{"foo":1}' : "value"}
                      value={v.value}
                      onChange={(e) => updateRow(i, { value: e.target.value })}
                    />
                  )}
                  <button className="icon-btn" onClick={() => removeRow(i)} title="Remove">
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              <button
                className="btn"
                data-size="sm"
                data-variant="ghost"
                onClick={addRow}
                style={{ alignSelf: "flex-start" }}
              >
                <Icon name="plus" size={11} />
                Add variable
              </button>
            </div>
          </div>
          {parseError && (
            <div className="badge" data-tone="bad" style={{ marginTop: 4 }}>
              {parseError}
            </div>
          )}
        </div>
        <div className="modal-ft">
          <button className="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn" data-variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Process Instances ─────────────────────────────────────────────
export const ProcessInstances = ({ onOpenInspector }: ScreenProps) => {
  const navigate = useNavigate();
  const instances = useApi(
    () => api.listProcessInstances({ size: 200, sort: "startTime", order: "desc" }),
    [],
  );
  const list = (instances.data?.data || []) as RuntimeInstance[];
  const openDetail = (id: string) => navigate({ to: "/instances/$id", params: { id } });

  return (
    <div className="page" style={{ paddingBottom: 24 }}>
      <PageHead
        title="Process instances"
        subtitle="Currently-running instances across all definitions."
        endpoints={DATA.endpoints.instances}
        onOpenInspector={onOpenInspector}
        actions={
          <button type="button" className="btn" onClick={instances.reload}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Business key</th>
              <th>Definition</th>
              <th>Activity</th>
              <th>Started by</th>
              <th>Started</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {instances.loading && <EmptyRow cols={6} msg="Loading…" />}
            {instances.error && (
              <EmptyRow cols={6} msg={String(instances.error.message || instances.error)} />
            )}
            {!instances.loading && !instances.error && list.length === 0 && (
              <EmptyRow cols={6} msg="No running process instances." />
            )}
            {list.map((p) => (
              <tr
                key={p.id}
                style={{ cursor: "pointer" }}
                tabIndex={0}
                onClick={() => openDetail(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openDetail(p.id);
                }}
              >
                <td className="mono">{p.businessKey || p.id}</td>
                <td>{(p.processDefinitionName as string | undefined) || p.processDefinitionKey}</td>
                <td className="soft">{(p.activityId as string | undefined) || "—"}</td>
                <td className="mono mute">
                  {(p.startUserId as string | undefined) || <span className="mute">—</span>}
                </td>
                <td className="mute mono">{fmtTime(p.startTime)}</td>
                <td>
                  <span className="badge" data-tone={stateOf(p) === "active" ? "ok" : "warn"}>
                    <span className="dot" />
                    {stateOf(p)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Jobs ──────────────────────────────────────────────────────────

export type JobsType = "executable" | "timer" | "deadletter";

interface JobsScreenProps extends ScreenProps {
  initialType?: JobsType | undefined;
  onTypeChange?: ((t: JobsType) => void) | undefined;
}

export const Jobs = ({ onOpenInspector, initialType, onTypeChange }: JobsScreenProps) => {
  const [tab, setTab] = React.useState<JobsType>(initialType ?? "executable");
  // Keep local state in sync if the URL changes externally (back button).
  React.useEffect(() => {
    if (initialType && initialType !== tab) setTab(initialType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType]);
  const setType = (t: JobsType) => {
    setTab(t);
    onTypeChange?.(t);
  };
  const fetcher = () => {
    if (tab === "timer") return api.listTimerJobs({ size: 200 });
    if (tab === "deadletter") return api.listDeadLetterJobs({ size: 200 });
    return api.listJobs({ size: 200 });
  };
  const jobs = useApi(fetcher, [tab]);
  const list = (jobs.data?.data || []) as RuntimeJob[];

  const retry = async (j: RuntimeJob) => {
    if (tab === "deadletter") await api.moveDeadLetterJob(j.id);
    else await api.executeJob(j.id);
    jobs.reload();
  };

  return (
    <div className="page">
      <PageHead
        title="Jobs"
        subtitle="Background work: timers, async continuations, and retry queues."
        endpoints={DATA.endpoints.jobs}
        onOpenInspector={onOpenInspector}
        actions={
          <button className="btn" onClick={jobs.reload}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="tbl-wrap">
        <div className="tbl-toolbar">
          <div className="seg-row">
            <button
              type="button"
              className="seg-btn"
              data-on={tab === "executable" ? "1" : "0"}
              onClick={() => setType("executable")}
            >
              Jobs
            </button>
            <button
              type="button"
              className="seg-btn"
              data-on={tab === "timer" ? "1" : "0"}
              onClick={() => setType("timer")}
            >
              Timers
            </button>
            <button
              type="button"
              className="seg-btn"
              data-on={tab === "deadletter" ? "1" : "0"}
              onClick={() => setType("deadletter")}
            >
              Dead-letter
            </button>
          </div>
          <span className="mute mono text-xs" style={{ marginLeft: "auto" }}>
            {list.length} of {jobs.data?.total ?? 0}
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Job</th>
              <th>Element</th>
              <th>Process</th>
              <th>Due</th>
              <th>Retries</th>
              <th>Exception</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.loading && <EmptyRow cols={7} msg="Loading…" />}
            {jobs.error && <EmptyRow cols={7} msg={String(jobs.error.message || jobs.error)} />}
            {!jobs.loading && !jobs.error && list.length === 0 && (
              <EmptyRow
                cols={7}
                msg={tab === "deadletter" ? "Dead-letter queue is empty." : "No jobs."}
              />
            )}
            {list.map((j) => (
              <tr key={j.id}>
                <td className="mono">{j.id}</td>
                <td className="mono mute">
                  {(j.elementId as string | undefined) ||
                    (j.elementName as string | undefined) ||
                    "—"}
                </td>
                <td className="mono">{j.processInstanceId || <span className="mute">—</span>}</td>
                <td className="mute mono">{j.dueDate ? fmtDue(j.dueDate) : "—"}</td>
                <td
                  className="mono"
                  style={{ color: j.retries === 0 ? "var(--bad)" : "var(--fg)" }}
                >
                  {j.retries}
                </td>
                <td
                  className="mono"
                  style={{
                    maxWidth: 240,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: j.exceptionMessage ? "var(--bad)" : "var(--fg-mute)",
                  }}
                >
                  {j.exceptionMessage || "—"}
                </td>
                <td>
                  <button
                    className="btn"
                    data-size="sm"
                    onClick={() => retry(j)}
                    title={tab === "deadletter" ? "Move back" : "Execute now"}
                  >
                    <Icon name="refresh" size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type RuntimeTask = Loose<import("./api").FlowableTask>;

// ── Tasks ──────────────────────────────────────────────────────────

export type TasksAssignee = "me" | "all" | "unassigned";

interface TasksScreenProps extends ScreenProps {
  initialAssignee?: TasksAssignee | undefined;
  onAssigneeChange?: ((a: TasksAssignee) => void) | undefined;
}

export const Tasks = ({ onOpenInspector, initialAssignee, onAssigneeChange }: TasksScreenProps) => {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState<TasksAssignee>(initialAssignee ?? "all");
  React.useEffect(() => {
    if (initialAssignee && initialAssignee !== filter) setFilter(initialAssignee);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAssignee]);
  const setAssignee = (a: TasksAssignee) => {
    setFilter(a);
    onAssigneeChange?.(a);
  };
  const fetcher = () => {
    const cfg = api.config();
    if (filter === "me" && cfg.username)
      return api.listTasks({ assignee: cfg.username, size: 200 });
    if (filter === "unassigned") return api.listTasks({ unassigned: true, size: 200 });
    return api.listTasks({ size: 200 });
  };
  const tasks = useApi(fetcher, [filter]);
  const list = (tasks.data?.data || []) as RuntimeTask[];
  const openDetail = (id: string) => navigate({ to: "/tasks/$id", params: { id } });

  return (
    <div className="page" style={{ padding: "24px 28px" }}>
      <PageHead
        title="Tasks"
        subtitle="Work assigned directly to you or available to claim."
        endpoints={DATA.endpoints.tasks}
        onOpenInspector={onOpenInspector}
        actions={
          <button type="button" className="btn" onClick={tasks.reload}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <div className="seg-row">
            <button
              type="button"
              className="seg-btn"
              data-on={filter === "me" ? "1" : "0"}
              onClick={() => setAssignee("me")}
            >
              Mine
            </button>
            <button
              type="button"
              className="seg-btn"
              data-on={filter === "unassigned" ? "1" : "0"}
              onClick={() => setAssignee("unassigned")}
            >
              Unassigned
            </button>
            <button
              type="button"
              className="seg-btn"
              data-on={filter === "all" ? "1" : "0"}
              onClick={() => setAssignee("all")}
            >
              All
            </button>
          </div>
          <span className="mute mono text-xs" style={{ marginLeft: "auto" }}>
            {list.length} of {tasks.data?.total ?? 0}
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {tasks.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {tasks.error && <ErrorBox error={tasks.error} />}
          {!tasks.loading && !tasks.error && list.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              No tasks for this filter.
            </div>
          )}
          {list.map((t) => (
            <div
              key={t.id}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: card is the row's nav affordance; Enter triggers it via onKeyDown.
              tabIndex={0}
              onClick={() => openDetail(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openDetail(t.id);
              }}
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t.name || t.id}
                </div>
                {t.dueDate && (
                  <span className="badge" data-tone="neutral" style={{ fontSize: 10 }}>
                    {fmtDue(t.dueDate)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--fg-mute)", display: "flex", gap: 8 }}>
                <span>
                  {(t.processDefinitionName as string | undefined) ||
                    (t.processDefinitionKey as string | undefined) ||
                    "—"}
                </span>
                <span>·</span>
                <span className="mono">
                  {t.assignee ||
                    (t.candidateGroup ? `group:${t.candidateGroup as string}` : "unclaimed")}
                </span>
              </div>
              <div
                style={{ fontSize: 10.5, color: "var(--fg-mute)", marginTop: 3 }}
                className="mono"
              >
                {t.id} · created {fmtTime(t.createTime)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

type HistoricInstance = Loose<import("./api").FlowableHistoricProcessInstance>;
type HistoricActivity = Loose<import("./api").FlowableHistoricActivity>;
type HistoricVariable = Loose<import("./api").FlowableHistoricVariable>;
type EmptyPage<T> = { data: T[]; total?: number };

// ── History ──────────────────────────────────────────────────────
export type HistoryType = "instances" | "activities" | "variables" | "tasks";

interface HistoryScreenProps extends ScreenProps {
  initialType?: HistoryType | undefined;
  onTypeChange?: ((t: HistoryType) => void) | undefined;
}

export const History = ({ onOpenInspector, initialType, onTypeChange }: HistoryScreenProps) => {
  const [histType, setHistType] = React.useState<HistoryType>(initialType ?? "instances");
  React.useEffect(() => {
    if (initialType && initialType !== histType) setHistType(initialType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType]);
  const setType = (t: HistoryType) => {
    setHistType(t);
    onTypeChange?.(t);
  };
  const completed = useApi(
    () => api.listHistoricInstances({ finished: true, size: 100, sort: "endTime", order: "desc" }),
    [],
  );
  const list = (completed.data?.data || []) as HistoricInstance[];
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [list, selectedId]);
  const sel = (list.find((p) => p.id === selectedId) || null) as HistoricInstance | null;
  const [tab, setTab] = React.useState<"audit" | "variables">("audit");
  const audit = useApi<EmptyPage<HistoricActivity>>(
    () =>
      sel
        ? (api.listHistoricActivities({
            processInstanceId: sel.id,
            size: 200,
            sort: "startTime",
          }) as unknown as Promise<EmptyPage<HistoricActivity>>)
        : Promise.resolve({ data: [] as HistoricActivity[] }),
    [sel?.id],
  );
  const vars = useApi<EmptyPage<HistoricVariable>>(
    () =>
      sel
        ? (api.listHistoricVariables({
            processInstanceId: sel.id,
            size: 200,
          }) as unknown as Promise<EmptyPage<HistoricVariable>>)
        : Promise.resolve({ data: [] as HistoricVariable[] }),
    [sel?.id],
  );

  return (
    <div className="page" style={{ padding: "24px 28px" }}>
      <PageHead
        title="History"
        subtitle="Completed process instances, with audit trail and variable values at each step."
        endpoints={DATA.endpoints.history}
        onOpenInspector={onOpenInspector}
        actions={
          <button type="button" className="btn" onClick={completed.reload}>
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="seg-row" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="seg-btn"
          data-on={histType === "instances" ? "1" : "0"}
          onClick={() => setType("instances")}
        >
          Instances
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={histType === "activities" ? "1" : "0"}
          onClick={() => setType("activities")}
        >
          Activities
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={histType === "variables" ? "1" : "0"}
          onClick={() => setType("variables")}
        >
          Variables
        </button>
        <button
          type="button"
          className="seg-btn"
          data-on={histType === "tasks" ? "1" : "0"}
          onClick={() => setType("tasks")}
        >
          Tasks
        </button>
      </div>
      {histType !== "instances" && <HistoryFlatTable type={histType} />}
      {histType === "instances" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 480px", gap: 16 }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Business key</th>
                  <th>Definition</th>
                  <th>Duration</th>
                  <th>Started</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {completed.loading && <EmptyRow cols={5} msg="Loading…" />}
                {completed.error && (
                  <EmptyRow cols={5} msg={String(completed.error.message || completed.error)} />
                )}
                {!completed.loading && !completed.error && list.length === 0 && (
                  <EmptyRow cols={5} msg="No completed instances yet." />
                )}
                {list.map((p) => (
                  <tr
                    key={p.id}
                    data-selected={p.id === selectedId ? "1" : "0"}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <td className="mono">{p.businessKey || p.id}</td>
                    <td>
                      {(p.processDefinitionName as string | undefined) || p.processDefinitionKey}
                    </td>
                    <td className="mono">{fmtMs(p.durationInMillis)}</td>
                    <td className="mute mono">{fmtTime(p.startTime)}</td>
                    <td className="mute mono">{fmtTime(p.endTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            {!sel && (
              <div className="empty" style={{ padding: 24 }}>
                Select an instance.
              </div>
            )}
            {sel && (
              <>
                <div className="panel-hd">
                  <span className="panel-title">{sel.businessKey || sel.id}</span>
                  <span className="mono mute" style={{ marginLeft: "auto", fontSize: 11 }}>
                    {sel.id}
                  </span>
                </div>
                <div className="panel-body" style={{ paddingTop: 0 }}>
                  <div className="tabs">
                    <div
                      className="tab"
                      data-active={tab === "audit" ? "1" : "0"}
                      onClick={() => setTab("audit")}
                    >
                      Audit trail
                    </div>
                    <div
                      className="tab"
                      data-active={tab === "variables" ? "1" : "0"}
                      onClick={() => setTab("variables")}
                    >
                      Variables
                    </div>
                  </div>
                  {tab === "audit" && (
                    <>
                      {audit.loading && (
                        <div className="empty" style={{ padding: 14 }}>
                          Loading…
                        </div>
                      )}
                      {audit.error && <ErrorBox error={audit.error} />}
                      {audit.data && (
                        <div style={{ position: "relative", paddingLeft: 18 }}>
                          <div
                            style={{
                              position: "absolute",
                              left: 7,
                              top: 6,
                              bottom: 6,
                              width: 1,
                              background: "var(--line)",
                            }}
                          />
                          {(audit.data.data || []).length === 0 && (
                            <div className="mute">No activity records.</div>
                          )}
                          {(audit.data.data || []).map((a) => (
                            <div key={a.id} style={{ position: "relative", paddingBottom: 14 }}>
                              <div
                                style={{
                                  position: "absolute",
                                  left: -15,
                                  top: 4,
                                  width: 11,
                                  height: 11,
                                  borderRadius: "50%",
                                  background:
                                    a.activityType === "endEvent"
                                      ? "var(--fg)"
                                      : a.activityType === "userTask"
                                        ? "var(--accent)"
                                        : "var(--bg-elev)",
                                  border: `1.5px solid ${a.activityType === "userTask" ? "var(--accent)" : "var(--fg-soft)"}`,
                                }}
                              />
                              <div style={{ fontSize: 13, fontWeight: 500 }}>
                                {a.activityName || a.activityId}
                              </div>
                              <div
                                className="mono"
                                style={{ fontSize: 11, color: "var(--fg-mute)" }}
                              >
                                {a.activityType} · {a.activityId}
                                {a.assignee != null && <> · assignee: {a.assignee as string}</>}
                              </div>
                              <div
                                className="mono"
                                style={{ fontSize: 11, color: "var(--fg-soft)", marginTop: 2 }}
                              >
                                {fmtMs(a.durationInMillis)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {tab === "variables" && (
                    <>
                      {vars.loading && (
                        <div className="empty" style={{ padding: 14 }}>
                          Loading…
                        </div>
                      )}
                      {vars.error && <ErrorBox error={vars.error} />}
                      {vars.data && (
                        <table className="tbl" style={{ border: 0 }}>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Value</th>
                              <th>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(vars.data.data || []).length === 0 && (
                              <tr>
                                <td colSpan={3} className="mute" style={{ padding: 14 }}>
                                  No variables.
                                </td>
                              </tr>
                            )}
                            {(vars.data.data || []).map((v) => (
                              <tr key={v.id}>
                                <td className="mono">{v.variableName}</td>
                                <td className="mono">
                                  {typeof v.value === "string" ? `"${v.value}"` : String(v.value)}
                                </td>
                                <td className="mute mono">{v.variableType}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const HistoryFlatTable = ({ type }: { type: HistoryType }) => {
  type AnyPage = { data: Array<Record<string, unknown>>; total?: number };
  const fetcher = (): Promise<AnyPage> => {
    if (type === "activities")
      return api.listHistoricActivities({
        size: 200,
        sort: "startTime",
      }) as unknown as Promise<AnyPage>;
    if (type === "variables")
      return api.listHistoricVariables({ size: 200 }) as unknown as Promise<AnyPage>;
    return api.listHistoricTasks({ size: 200, finished: true }) as unknown as Promise<AnyPage>;
  };
  const data = useApi(fetcher, [type]);
  const rows = (data.data?.data || []) as unknown as Array<Record<string, unknown>>;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            {type === "activities" && (
              <>
                <th>Activity</th>
                <th>Type</th>
                <th>Instance</th>
                <th>Started</th>
                <th>Duration</th>
              </>
            )}
            {type === "variables" && (
              <>
                <th>Name</th>
                <th>Value</th>
                <th>Type</th>
                <th>Instance</th>
              </>
            )}
            {type === "tasks" && (
              <>
                <th>Task</th>
                <th>Assignee</th>
                <th>Duration</th>
                <th>Started</th>
                <th>Ended</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {data.loading && <EmptyRow cols={5} msg="Loading…" />}
          {data.error && (
            <EmptyRow cols={5} msg={String((data.error as Error)?.message || data.error)} />
          )}
          {!data.loading && !data.error && rows.length === 0 && (
            <EmptyRow cols={5} msg="No records." />
          )}
          {rows.map((r) => (
            <tr key={String(r.id)}>
              {type === "activities" && (
                <>
                  <td>{String(r.activityName || r.activityId || "—")}</td>
                  <td className="mono">{String(r.activityType || "—")}</td>
                  <td className="mono mute">{String(r.processInstanceId || "—")}</td>
                  <td className="mute mono">{fmtTime(r.startTime as string | undefined)}</td>
                  <td className="mono">{fmtMs(r.durationInMillis as number | undefined)}</td>
                </>
              )}
              {type === "variables" && (
                <>
                  <td className="mono">{String(r.variableName || "—")}</td>
                  <td className="mono">
                    {typeof r.value === "string" ? `"${r.value}"` : String(r.value)}
                  </td>
                  <td className="mute mono">{String(r.variableType || "—")}</td>
                  <td className="mono mute">{String(r.processInstanceId || "—")}</td>
                </>
              )}
              {type === "tasks" && (
                <>
                  <td>{String(r.name || r.id || "—")}</td>
                  <td className="mono">{String(r.assignee || "—")}</td>
                  <td className="mono">{fmtMs(r.durationInMillis as number | undefined)}</td>
                  <td className="mute mono">{fmtTime(r.startTime as string | undefined)}</td>
                  <td className="mute mono">{fmtTime(r.endTime as string | undefined)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ── Identity ─────────────────────────────────────────────────────

export type IdentityTab = "users" | "groups";

interface IdentityScreenProps extends ScreenProps {
  initialTab?: IdentityTab | undefined;
  onTabChange?: ((t: IdentityTab) => void) | undefined;
}

export const Identity = ({ onOpenInspector, initialTab, onTabChange }: IdentityScreenProps) => {
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<IdentityTab>(initialTab ?? "users");
  React.useEffect(() => {
    if (initialTab && initialTab !== tab) setTab(initialTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTab]);
  const setIdentityTab = (t: IdentityTab) => {
    setTab(t);
    onTabChange?.(t);
  };
  const users = useApi(() => api.listUsers({ size: 500 }), []);
  const groups = useApi(() => api.listGroups({ size: 500 }), []);
  const userList = users.data?.data || [];
  const groupList = groups.data?.data || [];
  const openUser = (id: string) => navigate({ to: "/identity/users/$id", params: { id } });
  const openGroup = (id: string) => navigate({ to: "/identity/groups/$id", params: { id } });

  return (
    <div className="page">
      <PageHead
        title="Users & groups"
        subtitle="Identity records used by candidate-user, candidate-group, and assignee bindings."
        endpoints={DATA.endpoints.identity}
        onOpenInspector={onOpenInspector}
        actions={
          <button
            type="button"
            className="btn"
            onClick={() => {
              users.reload();
              groups.reload();
            }}
          >
            <Icon name="refresh" size={13} />
            Refresh
          </button>
        }
      />
      <div className="tabs">
        <div
          className="tab"
          data-active={tab === "users" ? "1" : "0"}
          onClick={() => setIdentityTab("users")}
        >
          Users · {users.data?.total ?? 0}
        </div>
        <div
          className="tab"
          data-active={tab === "groups" ? "1" : "0"}
          onClick={() => setIdentityTab("groups")}
        >
          Groups · {groups.data?.total ?? 0}
        </div>
      </div>
      {tab === "users" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>User</th>
                <th>ID</th>
                <th>Email</th>
                <th>Display name</th>
              </tr>
            </thead>
            <tbody>
              {users.loading && <EmptyRow cols={4} msg="Loading…" />}
              {users.error && (
                <EmptyRow cols={4} msg={String(users.error.message || users.error)} />
              )}
              {!users.loading && !users.error && userList.length === 0 && (
                <EmptyRow cols={4} msg="No users." />
              )}
              {userList.map((u) => {
                const initials = `${(u.firstName || "?")[0]}${(u.lastName || "?")[0]}`;
                return (
                  <tr
                    key={u.id}
                    style={{ cursor: "pointer" }}
                    tabIndex={0}
                    onClick={() => openUser(u.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openUser(u.id);
                    }}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          className="avatar"
                          style={{
                            width: 28,
                            height: 28,
                            fontSize: 10,
                            background: "var(--bg-sunken)",
                            color: "var(--fg)",
                            border: "1px solid var(--line)",
                          }}
                        >
                          {initials}
                        </div>
                        <span style={{ fontWeight: 500 }}>
                          {u.firstName || ""} {u.lastName || ""}
                        </span>
                      </div>
                    </td>
                    <td className="mono mute">{u.id}</td>
                    <td className="mono">{u.email || <span className="mute">—</span>}</td>
                    <td>
                      {((u as Loose<typeof u>).displayName as string | undefined) || (
                        <span className="mute">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {tab === "groups" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Group</th>
                <th>ID</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {groups.loading && <EmptyRow cols={3} msg="Loading…" />}
              {groups.error && (
                <EmptyRow cols={3} msg={String(groups.error.message || groups.error)} />
              )}
              {!groups.loading && !groups.error && groupList.length === 0 && (
                <EmptyRow cols={3} msg="No groups." />
              )}
              {groupList.map((g) => (
                <tr
                  key={g.id}
                  style={{ cursor: "pointer" }}
                  tabIndex={0}
                  onClick={() => openGroup(g.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openGroup(g.id);
                  }}
                >
                  <td>
                    <b style={{ fontWeight: 500 }}>{g.name || g.id}</b>
                  </td>
                  <td className="mono mute">{g.id}</td>
                  <td>
                    {g.type ? (
                      <span
                        className="badge"
                        data-tone={g.type === "security" ? "warn" : "neutral"}
                      >
                        {g.type}
                      </span>
                    ) : (
                      <span className="mute">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Tenants ─────────────────────────────────────────────────────
export const Tenants = ({ onOpenInspector, tenants }: TenantsScreenProps) => {
  return (
    <div className="page">
      <PageHead
        title="Tenants"
        subtitle="Logical isolation boundaries derived from deployment tenantIds (Flowable REST 7.2 has no /identity/tenants endpoint)."
        endpoints={DATA.endpoints.tenants}
        onOpenInspector={onOpenInspector}
      />
      {(tenants || []).length === 0 && (
        <div className="empty" style={{ padding: 30 }}>
          No tenant-scoped resources found. Deploy a process with a{" "}
          <span className="mono">tenantId</span> to populate this view.
        </div>
      )}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        {(tenants || []).map((t) => (
          <div key={t.id} className="kpi" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <Icon name="tenant" size={16} />
              <div style={{ fontSize: 15, fontWeight: 500 }}>{t.name}</div>
              <span className="mono mute" style={{ marginLeft: "auto", fontSize: 11 }}>
                {t.id}
              </span>
            </div>
            <div className="text-xs mute">
              Set this as your active tenant from the topbar; subsequent reads will filter to it.
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
