// SPDX-License-Identifier: Apache-2.0

/**
 * Identity list route (Story 14.1) — seventh application of the Story 9.1
 * canonical list archetype (loader + four-state contract + EmptyState +
 * TableSkeleton). The route hosts a two-tab read screen; the URL's
 * `?tab=` search-param drives WHICH endpoint the loader hits.
 *
 * Story 14.1 migrates `?tab=users` to the canonical archetype while
 * `?tab=groups` continues to render through the legacy `<Identity>`
 * component via `<LegacyIdentityShim>`. Story 14.2 migrates the groups
 * tab and the same story's chore(refactor) follow-up deletes both the
 * shim and the legacy block in `src/screens.tsx`.
 *
 * Precedent for the transitional-shim shape: Story 13.1's
 * `<LegacyHistoryShim>`, removed by 13.3's `87b9f98`. See CLAUDE.md
 * "<LegacyXxxShim> transitional-migration pattern for multi-tab screens."
 */

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import type React from "react";
import { z } from "zod";
import { api, type FlowableGroup, type FlowablePage, type FlowableUser } from "../../api";
import { Icon, PageHead } from "../../components";
import { EmptyState, emptyStates } from "../../lib/empty-states";
import { ErrorBox } from "../../lib/error-box";
import { TableSkeleton } from "../../lib/table-skeleton";

const identitySearch = z.object({
  tab: z.enum(["users", "groups"]).optional().default("users"),
});

export type IdentityTab = "users" | "groups";

// Loader dispatches per tab — fourth indisputable consumer of the
// tab-aware action-verb dispatch pattern (Execute / Move / history-tab
// read / identity-tab read). The discriminant stays inline at the call
// site per CLAUDE.md "Tab-aware action-verb dispatch" (project policy:
// never extract).
export const loadIdentity = (
  tab: IdentityTab,
): Promise<FlowablePage<FlowableUser>> | Promise<FlowablePage<FlowableGroup>> => {
  if (tab === "users") return api.listUsers({ size: 50 });
  return api.listGroups({ size: 50 });
};

export const Route = createFileRoute("/identity/")({
  validateSearch: identitySearch,
  loaderDeps: ({ search: { tab } }) => ({ tab }),
  loader: ({ deps }) => loadIdentity(deps.tab),
  staticData: {
    title: "Identity",
    endpoints: [
      { method: "GET", path: "/identity/users", desc: "List users" },
      { method: "GET", path: "/identity/groups", desc: "List groups" },
      {
        method: "GET",
        path: "/identity/users?memberOfGroup={id}",
        desc: "Group members (workaround)",
      },
      { method: "GET", path: "/identity/users/{userId}/groups", desc: "User groups (detail page)" },
    ],
  },
  component: IdentityRoute,
  pendingComponent: IdentityPending,
  errorComponent: IdentityError,
});

interface PageChromeProps {
  children: React.ReactNode;
  tab: IdentityTab;
  onTabChange: (t: IdentityTab) => void;
  onRefresh?: (() => void) | undefined;
}

function PageChrome({ children, tab, onTabChange, onRefresh }: PageChromeProps) {
  return (
    <div className="page">
      <PageHead
        title="Users & groups"
        subtitle="Identity records used by candidate-user, candidate-group, and assignee bindings."
        actions={
          onRefresh ? (
            <button type="button" className="btn" onClick={onRefresh}>
              <Icon name="refresh" size={13} />
              Refresh
            </button>
          ) : undefined
        }
      />
      <div className="seg-row" data-testid="identity-tabs" style={{ padding: "0 0 12px 0" }}>
        <button
          type="button"
          className="seg-btn"
          data-active={tab === "users" ? "1" : "0"}
          onClick={() => onTabChange("users")}
        >
          Users
        </button>
        <button
          type="button"
          className="seg-btn"
          data-active={tab === "groups" ? "1" : "0"}
          onClick={() => onTabChange("groups")}
        >
          Groups
        </button>
      </div>
      {children}
    </div>
  );
}

function useTabNav() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/identity/" });
  const onTabChange = (next: IdentityTab) =>
    navigate({ search: (prev) => ({ ...prev, tab: next }) });
  return { tab: tab as IdentityTab, onTabChange };
}

function IdentityPending() {
  const { tab, onTabChange } = useTabNav();
  return (
    <PageChrome tab={tab} onTabChange={onTabChange}>
      <div className="tbl-wrap">
        <TableSkeleton columns={4} rows={5} />
      </div>
    </PageChrome>
  );
}

interface IdentityErrorProps {
  error: Error;
  reset: () => void;
}

function IdentityError({ error, reset }: IdentityErrorProps) {
  const { tab, onTabChange } = useTabNav();
  return (
    <PageChrome tab={tab} onTabChange={onTabChange}>
      <ErrorBox error={error} onRetry={reset} />
    </PageChrome>
  );
}

function IdentityRoute() {
  const data = Route.useLoaderData();
  const { tab, onTabChange } = useTabNav();
  const router = useRouter();
  const refresh = () => router.invalidate({ filter: (r) => r.routeId === "/identity/" });

  return (
    <PageChrome tab={tab} onTabChange={onTabChange} onRefresh={refresh}>
      {tab === "users" ? (
        <UsersList page={data as FlowablePage<FlowableUser>} />
      ) : (
        <GroupsList page={data as FlowablePage<FlowableGroup>} />
      )}
    </PageChrome>
  );
}

interface UsersListProps {
  page: FlowablePage<FlowableUser>;
}

function UsersList({ page }: UsersListProps) {
  const navigate = useNavigate();
  const users = page.data;
  if (users.length === 0) {
    return <EmptyState entry={emptyStates.users as NonNullable<typeof emptyStates.users>} />;
  }
  const openUser = (id: string) => navigate({ to: "/identity/users/$id", params: { id } });
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>User</th>
            <th>ID</th>
            <th>Email</th>
            <th>Tenant</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const initials = `${(u.firstName || "?")[0]}${(u.lastName || "?")[0]}`;
            return (
              <tr
                key={u.id}
                data-testid={`user-row-${u.id}`}
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
                <td className="mono mute">{u.tenantId || <span className="mute">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface GroupsListProps {
  page: FlowablePage<FlowableGroup>;
}

function GroupsList({ page }: GroupsListProps) {
  const navigate = useNavigate();
  const groups = page.data;
  if (groups.length === 0) {
    return <EmptyState entry={emptyStates.groups as NonNullable<typeof emptyStates.groups>} />;
  }
  const openGroup = (id: string) => navigate({ to: "/identity/groups/$id", params: { id } });
  return (
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
          {groups.map((g) => (
            <tr
              key={g.id}
              data-testid={`group-row-${g.id}`}
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
                  <span className="badge" data-tone={g.type === "security" ? "warn" : "neutral"}>
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
  );
}
