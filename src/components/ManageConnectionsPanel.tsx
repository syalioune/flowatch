// SPDX-License-Identifier: Apache-2.0

/**
 * Manage-connections section (Story 23.1) — rendered INSIDE the SettingsModal
 * Connection tab. Lists every saved connection with Test / Edit / Delete row
 * actions + an `Add connection` primary button at the bottom; the bottom button
 * doubles as the `fallbackRef` target for `<DeleteConnectionModal>` (the
 * trigger row unmounts when the row deletes; fall back to a stable element
 * below).
 *
 * Re-reads `loadConnections()` on every {@link SAVED_CONNECTIONS_CHANGED}
 * event — no prop drilling. Subscribes lazily when the parent SettingsModal
 * is open; unsubscribes on unmount.
 *
 * OIDC sign-in/out affordances are shown inline below the active-connection
 * `<select>` when the active connection uses OIDC auth. Reuses the same
 * `data-testid` values that `<SettingsAuthTab>` used.
 */

import React from "react";
import { api } from "../api";
import { AddConnectionModal } from "../lib/add-connection-modal";
import { DeleteConnectionModal } from "../lib/delete-connection-modal";
import { EditConnectionModal } from "../lib/edit-connection-modal";
import { SAVED_CONNECTIONS_CHANGED } from "../lib/nav-events";
import { getOidcTokenAccessor, OIDC_AUTH_CHANGED } from "../lib/oidc-accessor";
import {
  loadConnections,
  type SavedConnection,
  type SavedConnectionsState,
  setActiveConnection,
} from "../lib/saved-connections";

export interface ManageConnectionsPanelProps {
  /**
   * Optional callback fired when the active connection is changed via the
   * inline `<select>`. Spec AC-3 directs the SettingsModal to close after
   * an active-switch ("operator-feel: switching IS the action").
   */
  onCloseSettings?: () => void;
}

type TestResult = { ok: boolean; text: string };

function OidcSignInOut() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    const handler = () => force();
    window.addEventListener(OIDC_AUTH_CHANGED, handler);
    return () => window.removeEventListener(OIDC_AUTH_CHANGED, handler);
  }, []);
  const accessor = getOidcTokenAccessor();
  if (!accessor) {
    return (
      <p
        className="mute"
        data-testid="oidc-provider-pending"
        style={{ fontSize: 11, margin: "6px 0 0" }}
      >
        Save to start the OIDC session — the app reloads to connect to your identity provider.
      </p>
    );
  }
  if (accessor.isAuthenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <span className="badge" data-tone="ok" data-testid="oidc-signed-in-as">
          <span className="sr-only">Status: signed in — </span>
          {accessor.username ?? "signed in"}
        </span>
        <button
          type="button"
          className="btn"
          data-testid="oidc-sign-out"
          onClick={() => accessor.signOut()}
        >
          Sign out
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="btn"
      data-variant="primary"
      data-testid="oidc-sign-in"
      style={{ marginTop: 6 }}
      onClick={() => accessor.signIn()}
    >
      Sign in with your identity provider
    </button>
  );
}

export const ManageConnectionsPanel: React.FC<ManageConnectionsPanelProps> = ({
  onCloseSettings,
}) => {
  const [state, setState] = React.useState<SavedConnectionsState>(() => loadConnections());
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SavedConnection | null>(null);
  const [deleting, setDeleting] = React.useState<SavedConnection | null>(null);
  const [testing, setTesting] = React.useState<Set<string>>(new Set());
  const [testResults, setTestResults] = React.useState<Map<string, TestResult>>(new Map());

  const addButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const editRowRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const deleteRowRefs = React.useRef(new Map<string, HTMLButtonElement | null>());

  React.useEffect(() => {
    const handler = () => {
      setState(loadConnections());
      setTestResults(new Map()); // clear stale results on any connection change
    };
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, handler);
    return () => window.removeEventListener(SAVED_CONNECTIONS_CHANGED, handler);
  }, []);

  const onActiveChange = (id: string) => {
    if (id === "") return;
    // Read activeId from storage rather than React state — covers the race
    // where the listener has not yet committed `setState(loadConnections())`.
    const currentActive = loadConnections().activeId;
    if (id === currentActive) return;
    try {
      setActiveConnection(id);
      // Keep the modal open for OIDC connections so the Sign In button is
      // immediately reachable without reopening Settings.
      const newConn = state.connections.find((c) => c.id === id);
      if (newConn?.authStrategyConfig?.kind !== "oidc") {
        onCloseSettings?.();
      }
    } catch {
      /* ignore — listbox values are sourced from the rendered state */
    }
  };

  const testConn = async (conn: SavedConnection) => {
    const kind = conn.authStrategyConfig?.kind ?? "basic";
    if (kind !== "basic") {
      setTestResults((prev) =>
        new Map(prev).set(conn.id, { ok: false, text: `Test not available for ${kind} auth` }),
      );
      return;
    }
    setTesting((prev) => new Set([...prev, conn.id]));
    try {
      const info = await api.pingForConn(conn);
      setTestResults((prev) =>
        new Map(prev).set(conn.id, { ok: true, text: info.name ?? "Connected" }),
      );
    } catch (e) {
      setTestResults((prev) =>
        new Map(prev).set(conn.id, { ok: false, text: String((e as Error)?.message ?? e) }),
      );
    } finally {
      setTesting((prev) => {
        const s = new Set(prev);
        s.delete(conn.id);
        return s;
      });
    }
  };

  const editingTriggerRef = React.useMemo<React.RefObject<HTMLElement | null>>(
    () => ({ current: editing ? (editRowRefs.current.get(editing.id) ?? null) : null }),
    [editing],
  );
  const deletingTriggerRef = React.useMemo<React.RefObject<HTMLElement | null>>(
    () => ({ current: deleting ? (deleteRowRefs.current.get(deleting.id) ?? null) : null }),
    [deleting],
  );

  const activeConn = state.connections.find((c) => c.id === state.activeId);
  const isOidc = activeConn?.authStrategyConfig?.kind === "oidc";

  return (
    <>
      <h4 data-testid="manage-connections-heading" style={{ margin: "0 0 10px", fontSize: 14 }}>
        Manage saved connections
      </h4>
      <div className="form-row">
        <label htmlFor="manage-connections-active">Active connection</label>
        <select
          id="manage-connections-active"
          className="input"
          data-testid="manage-connections-active-select"
          value={state.activeId ?? ""}
          onChange={(e) => onActiveChange(e.target.value)}
        >
          {state.activeId === null && (
            <option value="" disabled>
              — None —
            </option>
          )}
          {state.connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {isOidc && <OidcSignInOut />}
      </div>
      <ul
        data-testid="saved-connections-list"
        style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 6 }}
      >
        {state.connections.map((c) => {
          const truncated = c.baseUrl.length > 36 ? `${c.baseUrl.slice(0, 36)}…` : c.baseUrl;
          const isTesting = testing.has(c.id);
          const result = testResults.get(c.id);
          return (
            <li
              key={c.id}
              data-testid={`saved-connection-row-${c.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 8px",
                border: "1px solid var(--line)",
                borderRadius: "var(--r-sm)",
                background: "var(--bg-elev)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{c.label}</div>
                <code
                  style={{
                    fontSize: 11,
                    color: "var(--fg-mute)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {truncated}
                </code>
              </div>
              {c.id === state.activeId && (
                <span className="badge" data-tone="ok">
                  <span className="sr-only">Status: </span>Active
                </span>
              )}
              {result && (
                <span className="badge" data-tone={result.ok ? "ok" : "bad"}>
                  <span className="sr-only">Status: </span>
                  {result.text}
                </span>
              )}
              <button
                type="button"
                className="btn"
                data-testid={`test-connection-${c.id}`}
                disabled={isTesting}
                onClick={() => testConn(c)}
              >
                {isTesting ? "Testing…" : "Test"}
              </button>
              <button
                ref={(el) => {
                  if (el === null) editRowRefs.current.delete(c.id);
                  else editRowRefs.current.set(c.id, el);
                }}
                type="button"
                className="btn"
                data-testid={`edit-connection-${c.id}`}
                onClick={() => setEditing(c)}
              >
                Edit
              </button>
              <button
                ref={(el) => {
                  if (el === null) deleteRowRefs.current.delete(c.id);
                  else deleteRowRefs.current.set(c.id, el);
                }}
                type="button"
                className="btn"
                data-tone="bad"
                data-testid={`delete-connection-${c.id}`}
                onClick={() => setDeleting(c)}
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
      <div style={{ marginTop: 10 }}>
        <button
          ref={addButtonRef}
          type="button"
          className="btn"
          data-variant="primary"
          data-testid="add-connection"
          onClick={() => setAddOpen(true)}
        >
          Add connection
        </button>
      </div>

      <AddConnectionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={() => setAddOpen(false)}
        triggerRef={addButtonRef}
      />
      <EditConnectionModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        connection={editing}
        onSuccess={() => setEditing(null)}
        triggerRef={editingTriggerRef}
      />
      <DeleteConnectionModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        connection={deleting}
        onSuccess={() => setDeleting(null)}
        triggerRef={deletingTriggerRef}
        fallbackRef={addButtonRef}
      />
    </>
  );
};
