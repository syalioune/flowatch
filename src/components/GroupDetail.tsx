// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /identity/groups/$id.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → reverse-membership lookup not exposed by flowable-rest 7.2
 *   - data     → property table
 *
 * Story 22.3 — adds Edit + Delete header affordances mirroring UserDetail
 * (Story 22.2). Delete is one-shot destructive `alertdialog` with
 * `fallbackRef` cross-domain consumer N=2.
 */

import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import React from "react";
import type { FlowableGroup } from "../api";
import { Icon, PageHead } from "../components";
import { DeleteGroupModal } from "../lib/delete-group-modal";
import { EditGroupModal } from "../lib/edit-group-modal";
import { GroupMembersPanel } from "./GroupMembersPanel";

interface Props {
  group: FlowableGroup;
}

export function GroupDetail({ group }: Props) {
  const g = group;
  const router = useRouter();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const editTriggerRef = React.useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = React.useRef<HTMLButtonElement>(null);
  const backLinkRef = React.useRef<HTMLAnchorElement>(null);

  return (
    <div className="page">
      <PageHead
        title={g.name || g.id}
        actions={
          <>
            <button
              ref={editTriggerRef}
              type="button"
              className="btn"
              data-variant="ghost"
              data-testid="edit-group"
              onClick={() => setEditOpen(true)}
            >
              Edit group
            </button>
            <button
              ref={deleteTriggerRef}
              type="button"
              className="btn"
              data-variant="danger"
              data-testid="delete-group"
              onClick={() => setDeleteOpen(true)}
            >
              Delete group…
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
          <span className="panel-title">Properties</span>
          {g.type && (
            <span
              className="badge"
              data-tone={g.type === "security" ? "warn" : "neutral"}
              style={{ marginLeft: "auto" }}
            >
              <span className="sr-only">Group type: </span>
              {g.type}
            </span>
          )}
        </div>
        <div style={{ overflow: "auto" }}>
          <table className="tbl" style={{ border: 0, borderRadius: 0 }}>
            <tbody>
              <tr>
                <td className="mute" style={{ width: 200 }}>
                  ID
                </td>
                <td className="mono">{g.id}</td>
              </tr>
              <tr>
                <td className="mute">Name</td>
                <td>{g.name || <span className="mute">—</span>}</td>
              </tr>
              <tr>
                <td className="mute">Type</td>
                <td className="mono">{g.type || <span className="mute">—</span>}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <GroupMembersPanel groupId={g.id} />
      <EditGroupModal
        group={editOpen ? g : null}
        triggerRef={editTriggerRef}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          setEditOpen(false);
          router.invalidate({ filter: (r) => r.routeId === "/identity/groups/$id" });
        }}
      />
      <DeleteGroupModal
        group={deleteOpen ? g : null}
        triggerRef={deleteTriggerRef}
        fallbackRef={backLinkRef as React.RefObject<HTMLElement | null>}
        onClose={() => setDeleteOpen(false)}
        onSettled={() => {
          setDeleteOpen(false);
          navigate({ to: "/identity", search: { tab: "groups" as const } });
        }}
      />
    </div>
  );
}
