// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /identity/users/$id.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → "No groups." when membership list is empty
 *   - data     → property table + group memberships
 *
 * Story 14.3 — adds Add to group + Remove from group write ops. Map-
 * symmetry per CLAUDE.md "Map-symmetry for reverse-action pairs":
 * single `optimisticMembership` Map consumed by both handlers.
 */

import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import { api, type FlowableGroup, type FlowableUser } from "../api";
import { Icon, PageHead, toast } from "../components";
import { AddMembershipModal } from "../lib/add-membership-modal";
import { DeleteUserModal } from "../lib/delete-user-modal";
import { EditUserModal } from "../lib/edit-user-modal";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

interface Props {
  user: FlowableUser;
}

type UserWide = FlowableUser & { displayName?: string };
type OptimisticStatus = "added" | "removed";

export function UserDetail({ user }: Props) {
  const memberships = useApi(() => api.getUserGroups(user.id), [user.id]);
  const router = useRouter();
  const navigate = useNavigate();
  const u = user as UserWide;
  const initials = `${(u.firstName || "?")[0]}${(u.lastName || "?")[0]}`;
  const [addOpen, setAddOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const addTriggerRef = React.useRef<HTMLButtonElement>(null);
  const editTriggerRef = React.useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = React.useRef<HTMLButtonElement>(null);
  const backLinkRef = React.useRef<HTMLAnchorElement>(null);
  const [optimisticMembership, setOptimisticMembership] = React.useState<
    Map<string, OptimisticStatus>
  >(new Map());

  // Clear optimistic state once the engine response settles
  React.useEffect(() => {
    if (memberships.data && optimisticMembership.size > 0) {
      setOptimisticMembership(new Map());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships.data]);

  const handleRemove = async (g: FlowableGroup) => {
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id;
    const ok = window.confirm(
      `Remove ${fullName} (${u.id}) from group ${g.name || g.id} (${g.id})? This cannot be undone.`,
    );
    if (!ok) return;
    setOptimisticMembership((prev) => {
      const next = new Map(prev);
      next.set(g.id, "removed");
      return next;
    });
    try {
      await api.removeUserFromGroup(u.id, g.id);
      toast({ kind: "ok", text: `Removed ${fullName} from ${g.name || g.id}.`, ttl: 3000 });
      memberships.reload();
    } catch (err) {
      setOptimisticMembership((prev) => {
        const next = new Map(prev);
        next.delete(g.id);
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
    <div className="page">
      <PageHead
        title={`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id}
        subtitle={u.displayName ?? undefined}
        actions={
          <>
            <button
              ref={editTriggerRef}
              type="button"
              className="btn"
              data-variant="ghost"
              data-testid="edit-user"
              onClick={() => setEditOpen(true)}
            >
              Edit user
            </button>
            <button
              ref={deleteTriggerRef}
              type="button"
              className="btn"
              data-variant="danger"
              data-testid="delete-user"
              onClick={() => setDeleteOpen(true)}
            >
              Delete user…
            </button>
            <Link ref={backLinkRef} to="/identity" className="btn" data-variant="ghost">
              <Icon name="chevron" size={12} />
              Back
            </Link>
          </>
        }
      />
      <div className="panel">
        <div className="panel-hd">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              className="avatar"
              style={{
                width: 32,
                height: 32,
                fontSize: 11,
                background: "var(--bg-sunken)",
                color: "var(--fg)",
                border: "1px solid var(--line)",
              }}
            >
              {initials}
            </div>
            <span className="panel-title">{u.id}</span>
          </div>
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  ID
                </td>
                <td className="mono">{u.id}</td>
              </tr>
              <tr>
                <td className="mute">First name</td>
                <td>{u.firstName || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Last name</td>
                <td>{u.lastName || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Email</td>
                <td className="mono">{u.email || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Display name</td>
                <td>{u.displayName || <span className="mute">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-hd">
          <span className="panel-title">Group memberships</span>
          <span
            className="mono mute"
            style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg-mute)" }}
          >
            GET /identity/users/{u.id}/groups
          </span>
          <button
            type="button"
            className="btn"
            data-size="sm"
            data-testid="add-user-to-group"
            ref={addTriggerRef}
            onClick={() => setAddOpen(true)}
            style={{ marginLeft: 8 }}
          >
            <Icon name="plus" size={12} />
            Add to group
          </button>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          {memberships.loading && (
            <div className="empty" style={{ padding: 20 }}>
              Loading…
            </div>
          )}
          {memberships.error && <ErrorBox error={memberships.error} onRetry={memberships.reload} />}
          {memberships.data && memberships.data.data.length === 0 && (
            <div className="empty" style={{ padding: 20 }}>
              No group memberships.
            </div>
          )}
          {memberships.data?.data.map((g) => {
            const optimistic = optimisticMembership.get(g.id);
            return (
              <div
                key={g.id}
                data-testid={`user-group-row-${g.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--line)",
                  gap: 10,
                }}
              >
                <Link
                  to="/identity/groups/$id"
                  params={{ id: g.id }}
                  className="mono"
                  style={{ flex: 1 }}
                >
                  {g.name || g.id}
                </Link>
                {optimistic && (
                  <span className="badge" data-tone={optimistic === "added" ? "ok" : "mute"}>
                    <span className="sr-only">Status: </span>
                    {optimistic}
                  </span>
                )}
                {g.type && (
                  <span className="badge" data-tone={g.type === "security" ? "warn" : "neutral"}>
                    <span className="sr-only">Group type: </span>
                    {g.type}
                  </span>
                )}
                <button
                  type="button"
                  className="btn"
                  data-variant="ghost"
                  data-size="sm"
                  data-testid={`remove-membership-${g.id}`}
                  onClick={() => void handleRemove(g)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <AddMembershipModal
        open={addOpen}
        mode="add-group-to-user"
        userId={u.id}
        triggerRef={addTriggerRef}
        onClose={() => setAddOpen(false)}
        onSuccess={() => {
          setOptimisticMembership((prev) => new Map(prev));
          memberships.reload();
        }}
      />
      <EditUserModal
        user={editOpen ? u : null}
        triggerRef={editTriggerRef}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          setEditOpen(false);
          router.invalidate({ filter: (r) => r.routeId === "/identity/users/$id" });
        }}
      />
      <DeleteUserModal
        user={deleteOpen ? u : null}
        triggerRef={deleteTriggerRef}
        fallbackRef={backLinkRef as React.RefObject<HTMLElement | null>}
        onClose={() => setDeleteOpen(false)}
        onSettled={() => {
          setDeleteOpen(false);
          navigate({ to: "/identity", search: { tab: "users" as const } });
        }}
      />
    </div>
  );
}
