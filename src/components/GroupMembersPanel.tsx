// SPDX-License-Identifier: Apache-2.0

/**
 * Group members panel (Story 14.2) — ninth panel-as-sibling consumer
 * after 10.4 `InstanceVariablesPanel`, 11.3 `TaskFormPanel`, 12.4
 * `JobStacktracePanel`, 13.1 (4 panels), 13.2
 * `InstanceHistoricActivitiesPanel`. Project decision (Epic 12 retro
 * R-2): never extract. See CLAUDE.md.
 *
 * Story 14.2 — replaces the "Reverse membership lookup is not available
 * in flowable-rest 7.2" placeholder in <GroupDetail> with the supported
 * `GET /identity/users?memberOfGroup={id}` workaround via the new
 * `api.listGroupMembers` wrapper.
 *
 * Story 14.3 — adds Add user (modal-driven) + Remove user (row-level,
 * window.confirm + optimistic Map per CLAUDE.md "Map-symmetry for
 * reverse-action pairs"). First full application of the Epic 13 retro
 * §3.2 spec-symmetry discipline.
 */

import { Link } from "@tanstack/react-router";
import React from "react";
import { api, type FlowablePage, type FlowableUser } from "../api";
import { Icon, toast } from "../components";
import { AddMembershipModal } from "../lib/add-membership-modal";
import { EmptyState, getEmptyState } from "../lib/empty-states";
import { ErrorBox } from "../lib/error-box";
import { TableSkeleton } from "../lib/table-skeleton";
import { useApi } from "../lib/useApi";

interface Props {
  groupId: string;
}

type OptimisticStatus = "added" | "removed";

export function GroupMembersPanel({ groupId }: Props) {
  const members = useApi<FlowablePage<FlowableUser>>(
    () => api.listGroupMembers(groupId, { size: 50 }),
    [groupId],
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const addTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [optimisticMembership, setOptimisticMembership] = React.useState<
    Map<string, OptimisticStatus>
  >(new Map());

  // Clear optimistic state once the engine response settles
  React.useEffect(() => {
    if (members.data && optimisticMembership.size > 0) {
      setOptimisticMembership(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members.data]);

  const list = members.data?.data ?? [];

  const handleRemove = async (user: FlowableUser) => {
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.id;
    const ok = window.confirm(
      `Remove ${fullName} (${user.id}) from group ${groupId}? This cannot be undone.`,
    );
    if (!ok) return;
    setOptimisticMembership((prev) => {
      const next = new Map(prev);
      next.set(user.id, "removed");
      return next;
    });
    try {
      await api.removeUserFromGroup(user.id, groupId);
      toast({ kind: "ok", text: `Removed ${fullName} from ${groupId}.`, ttl: 3000 });
      members.reload();
    } catch (err) {
      setOptimisticMembership((prev) => {
        const next = new Map(prev);
        next.delete(user.id);
        return next;
      });
      toast({
        kind: "err",
        text: `Failed to remove: ${err instanceof Error ? err.message : String(err)}`,
        ttl: 5000,
      });
    }
  };

  return (
    <div className="panel" data-testid="group-members-panel" style={{ marginTop: 18 }}>
      <div className="panel-hd">
        <span className="panel-title">Members</span>
        {members.data && list.length > 0 && (
          <span className="badge" data-tone="mute" style={{ marginLeft: 8 }}>
            <span className="sr-only">Members: </span>
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
          className="btn"
          data-size="sm"
          data-testid="add-member-to-group"
          ref={addTriggerRef}
          onClick={() => setAddOpen(true)}
          style={{ marginLeft: 8 }}
        >
          <Icon name="plus" size={12} />
          Add user
        </button>
        <button
          type="button"
          className="icon-btn"
          data-testid="group-members-refresh"
          onClick={members.reload}
          disabled={members.loading}
          aria-label="Refresh group members"
          style={{ marginLeft: 4 }}
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {members.loading && (
          <div style={{ padding: 12 }}>
            <TableSkeleton columns={4} rows={4} />
          </div>
        )}
        {members.error && <ErrorBox error={members.error} onRetry={members.reload} />}
        {!members.loading && !members.error && list.length === 0 && (
          <EmptyState entry={getEmptyState("groupMembers")} />
        )}
        {!members.loading && !members.error && list.length > 0 && (
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">ID</th>
                <th scope="col">Email</th>
                <th scope="col" style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id;
                const optimistic = optimisticMembership.get(u.id);
                return (
                  <tr key={u.id} data-testid={`group-member-row-${u.id}`}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Link
                          to="/identity/users/$id"
                          params={{ id: u.id }}
                          style={{ fontWeight: 500 }}
                        >
                          {fullName}
                        </Link>
                        {optimistic && (
                          <span
                            className="badge"
                            data-tone={optimistic === "added" ? "ok" : "mute"}
                          >
                            <span className="sr-only">Status: </span>
                            {optimistic}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mono mute">{u.id}</td>
                    <td className="mono">{u.email || <span className="mute">—</span>}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        data-variant="ghost"
                        data-size="sm"
                        data-testid={`remove-member-${u.id}`}
                        onClick={() => void handleRemove(u)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <AddMembershipModal
        open={addOpen}
        mode="add-user-to-group"
        groupId={groupId}
        triggerRef={addTriggerRef}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setOptimisticMembership((prev) => new Map(prev));
          members.reload();
        }}
      />
    </div>
  );
}
