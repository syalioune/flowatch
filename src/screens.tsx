// SPDX-License-Identifier: Apache-2.0
// size-exempt: pending split into per-screen modules per NFR-21 (deferred refactor; tracked as a separate story).

import { useNavigate } from "@tanstack/react-router";
import React from "react";
import { api } from "./api";
import { Icon, PageHead } from "./components";
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

// ── History — moved to src/routes/history/index.tsx (Stories 13.1 + 13.3) ──
// Canonical list archetype with multi-endpoint loader dispatch. The per-
// instance audit trail lives in <InstanceHistoricActivitiesPanel> on
// /instances/$id (Story 13.2). The legacy <History> + <HistoryFlatTable>
// block was removed in the Story 13.3 follow-up refactor commit.

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
