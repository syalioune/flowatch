/**
 * Detail screen for /identity/users/$id.
 *
 * Pattern P-002 four states:
 *   - loading  → route's pendingComponent
 *   - error    → route's errorComponent
 *   - empty    → "No groups." when membership list is empty
 *   - data     → property table + group memberships
 */

import { Link } from "@tanstack/react-router";
import { api, type FlowableUser } from "../api";
import { Icon, PageHead } from "../components";
import DATA from "../data";
import { ErrorBox } from "../lib/error-box";
import { useApi } from "../lib/useApi";

interface Props {
  user: FlowableUser;
  onOpenInspector?: () => void;
}

type UserWide = FlowableUser & { displayName?: string };

export function UserDetail({ user, onOpenInspector }: Props) {
  const memberships = useApi(() => api.getUserGroups(user.id), [user.id]);
  const u = user as UserWide;
  const initials = `${(u.firstName || "?")[0]}${(u.lastName || "?")[0]}`;
  return (
    <div className="page">
      <PageHead
        title={`${u.firstName || ""} ${u.lastName || ""}`.trim() || u.id}
        subtitle={u.displayName ?? undefined}
        endpoints={DATA.endpoints.identity}
        onOpenInspector={onOpenInspector ? () => onOpenInspector() : undefined}
        actions={
          <Link to="/identity" className="btn" data-variant="ghost">
            <Icon name="chevron" size={12} />
            Back
          </Link>
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
          {memberships.data?.data.map((g) => (
            <div
              key={g.id}
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
              {g.type && (
                <span className="badge" data-tone={g.type === "security" ? "warn" : "neutral"}>
                  {g.type}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
