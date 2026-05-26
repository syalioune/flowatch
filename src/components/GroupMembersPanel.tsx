// SPDX-License-Identifier: Apache-2.0

/**
 * Group members panel (Story 14.2) — ninth panel-as-sibling consumer
 * after 10.4 `InstanceVariablesPanel`, 11.3 `TaskFormPanel`, 12.4
 * `JobStacktracePanel`, 13.1 (4 panels), 13.2
 * `InstanceHistoricActivitiesPanel`. Project decision (Epic 12 retro
 * R-2): never extract. See CLAUDE.md.
 *
 * Replaces the "Reverse membership lookup is not available in
 * flowable-rest 7.2" placeholder in <GroupDetail> with the supported
 * `GET /identity/users?memberOfGroup={id}` workaround via the new
 * `api.listGroupMembers` wrapper.
 *
 * Forward-compat: each member row carries `data-testid="group-member-
 * row-${id}"` as the placeholder-then-real swap point for Story 14.3's
 * Remove action.
 */

import { Link } from "@tanstack/react-router";
import { api, type FlowablePage, type FlowableUser } from "../api";
import { Icon } from "../components";
import { EmptyState, emptyStates } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

interface Props {
  groupId: string;
}

export function GroupMembersPanel({ groupId }: Props) {
  const members = useApi<FlowablePage<FlowableUser>>(
    () => api.listGroupMembers(groupId, { size: 50 }),
    [groupId],
  );

  const list = members.data?.data ?? [];

  return (
    <div className="panel" data-testid="group-members-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Members</span>
        {members.data && list.length > 0 && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            {members.data.total}
          </span>
        )}
        <span
          className="mono mute"
          style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
        >
          GET /identity/users?memberOfGroup={groupId}
        </span>
        <button
          type="button"
          className="icon-btn"
          data-testid="group-members-refresh"
          onClick={members.reload}
          disabled={members.loading}
          aria-label="Refresh group members"
          style={{ marginLeft: 8 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {members.loading && (
          <div style={{ padding: 12 }}>
            <TableSkeleton columns={3} rows={4} />
          </div>
        )}
        {members.error && <ErrorBox error={members.error} onRetry={members.reload} />}
        {!members.loading && !members.error && list.length === 0 && (
          <EmptyState
            entry={emptyStates.groupMembers as NonNullable<typeof emptyStates.groupMembers>}
          />
        )}
        {!members.loading && !members.error && list.length > 0 && (
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <thead>
              <tr>
                <th>User</th>
                <th>ID</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id;
                return (
                  <tr key={u.id} data-testid={`group-member-row-${u.id}`}>
                    <td>
                      <Link
                        to="/identity/users/$id"
                        params={{ id: u.id }}
                        style={{ fontWeight: 500 }}
                      >
                        {fullName}
                      </Link>
                    </td>
                    <td className="mono mute">{u.id}</td>
                    <td className="mono">{u.email || <span className="mute">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
