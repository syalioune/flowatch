// SPDX-License-Identifier: Apache-2.0
// size-exempt: pending split into per-screen modules per NFR-21 (deferred refactor; tracked as a separate story).

import { useNavigate } from "@tanstack/react-router";
import React from "react";
import { api } from "./api";
import { fmtTime, Icon, PageHead } from "./components";
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

interface TenantsScreenProps {
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

// Dashboard moved to src/routes/index.tsx (Story 7.4): four
// Promise.allSettled KPI tiles with per-tile state handling per NFR-6.
// The previous rich Dashboard (tables + panels) is intentionally gone:
// the page is now "tile-shaped, not list-shaped".

// ── Deployments — moved to src/routes/deployments/index.tsx (Story 9.1) ──
// Canonical list archetype now lives in the route file. EmptyState / TableSkeleton
// / RowActionMenu in src/lib/ are reusable primitives every list screen will copy.

// ── Process Definitions — moved to src/routes/definitions/index.tsx (Story 9.4) ──
// Canonical list archetype (loader + four-state + RowActionMenu). The previous
// inline Start Instance modal is deferred to Story 10.2; 9.4 ships a placeholder
// menu item that toasts a forward-reference until 10.2 lands.

// ── Process Instances — moved to src/routes/instances/index.tsx (Story 10.1) ──
// Canonical list archetype (loader + four-state). The Cancel menu item is a
// placeholder forward-referencing Story 10.3.

// ── Jobs — moved to src/routes/jobs/index.tsx (Story 12.1) ────────
// Canonical list archetype (loader + four-state + RowActionMenu) with the
// URL-driven `<seg-row>` selecting between three different management
// endpoints. Three placeholder row actions forward-reference Stories 12.2
// (Execute now), 12.3 (Move to executable), 12.4 (View stacktrace).

// ── Tasks — moved to src/routes/tasks/index.tsx (Story 11.1) ──────
// Canonical list archetype (loader + four-state + RowActionMenu) with the
// first in-page search-param-driven filter `<seg-row>` and four placeholder
// row actions forward-referencing Stories 11.2 / 11.4 / 11.5.

type HistoricInstance = Loose<import("./api").FlowableHistoricProcessInstance>;
type HistoricActivity = Loose<import("./api").FlowableHistoricActivity>;
type HistoricVariable = Loose<import("./api").FlowableHistoricVariable>;
type EmptyPage<T> = { data: T[]; total?: number };

// ── History ──────────────────────────────────────────────────────
export type HistoryType = "instances" | "activities" | "variables" | "tasks";

interface HistoryScreenProps {
  initialType?: HistoryType | undefined;
  onTypeChange?: ((t: HistoryType) => void) | undefined;
}

export const History = ({ initialType, onTypeChange }: HistoryScreenProps) => {
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

interface IdentityScreenProps {
  initialTab?: IdentityTab | undefined;
  onTabChange?: ((t: IdentityTab) => void) | undefined;
}

export const Identity = ({ initialTab, onTabChange }: IdentityScreenProps) => {
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
export const Tenants = ({ tenants }: TenantsScreenProps) => {
  return (
    <div className="page">
      <PageHead
        title="Tenants"
        subtitle="Logical isolation boundaries derived from deployment tenantIds (Flowable REST 7.2 has no /identity/tenants endpoint)."
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
