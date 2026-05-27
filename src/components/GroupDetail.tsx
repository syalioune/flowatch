// SPDX-License-Identifier: Apache-2.0

/**
 * Detail screen for /identity/groups/$id.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → reverse-membership lookup not exposed by flowable-rest 7.2
 *   - data     → property table
 */

import { Link } from "@tanstack/react-router";
import type { FlowableGroup } from "../api";
import { Icon, PageHead } from "../components";
import { GroupMembersPanel } from "./GroupMembersPanel";

interface Props {
  group: FlowableGroup;
}

export function GroupDetail({ group }: Props) {
  const g = group;
  return (
    <div className="page">
      <PageHead
        title={g.name || g.id}
        actions={
          <Link to="/identity" className="btn" data-variant="ghost">
            <Icon name="chevron" size={12} />
            Back
          </Link>
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
    </div>
  );
}
