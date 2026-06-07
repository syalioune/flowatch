// SPDX-License-Identifier: Apache-2.0

/**
 * Settings → Authentication tab (Story 28.2 / 28.4).
 *
 * Extracted from `src/components.tsx` (NFR-21 ≤50 KB file-size gate). Edits the
 * ACTIVE connection's auth method (the one from `getActiveConnection()`); a
 * non-active connection's auth is edited via the Add/Edit modals (Connection
 * tab → Manage). Save validates via Story 23.2's `parseAuthStrategyConfig`,
 * persists via `updateConnection`, then re-installs the strategy so the change
 * applies without a reload (Basic/Bearer) or via a guarded reload (OIDC).
 *
 * Imports `api` + `toast` from the barrel `../components`: this is a runtime-
 * safe import cycle (components.tsx imports this file lazily for the tab; `api`
 * / `toast` are only touched inside effects + handlers, never at module init).
 */

import React from "react";
import { toast } from "../components";
import {
  type AuthStrategyKind,
  formatErrors,
  parseAuthStrategyConfig,
} from "../lib/auth-strategy-config";
import { ErrorBox } from "../lib/error-box";
import {
  installStrategyForActiveConnection,
  reloadIfOidcProviderMismatch,
} from "../lib/install-auth-strategy";
import { SAVED_CONNECTIONS_CHANGED } from "../lib/nav-events";
import { getOidcTokenAccessor, OIDC_AUTH_CHANGED } from "../lib/oidc-accessor";
import {
  getActiveConnection,
  type SavedConnection,
  updateConnection,
} from "../lib/saved-connections";
import { AuthStrategyFields } from "./AuthStrategyFields";

type AuthTabState = {
  kind: AuthStrategyKind;
  username: string;
  password: string;
  bearerToken: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcScopes: string;
};

const hydrateAuthTab = (conn: SavedConnection | null): AuthTabState => {
  const asc = conn?.authStrategyConfig;
  return {
    kind: asc?.kind ?? "basic",
    username: asc?.kind === "basic" ? asc.config.username : (conn?.username ?? ""),
    password: asc?.kind === "basic" ? asc.config.password : (conn?.password ?? ""),
    bearerToken: asc?.kind === "bearer" ? asc.config.token : "",
    oidcIssuer: asc?.kind === "oidc" ? asc.config.issuer : "",
    oidcClientId: asc?.kind === "oidc" ? asc.config.clientId : "",
    oidcScopes: asc?.kind === "oidc" ? asc.config.scopes.join(", ") : "",
  };
};

const buildAuthTabConfig = (st: AuthTabState): unknown => {
  if (st.kind === "basic") {
    return { kind: "basic", config: { username: st.username, password: st.password } };
  }
  if (st.kind === "bearer") {
    return { kind: "bearer", config: { token: st.bearerToken.trim() } };
  }
  return {
    kind: "oidc",
    config: {
      issuer: st.oidcIssuer.trim(),
      clientId: st.oidcClientId.trim(),
      scopes: st.oidcScopes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
  };
};

// Story 28.4: OIDC sign-in / sign-out affordances. Reads the in-memory token
// accessor (published by the OidcTokenBridge inside <AuthProvider>) and
// re-renders on OIDC_AUTH_CHANGED. When the provider isn't mounted yet (the
// operator picked OIDC but hasn't saved+reloaded), the accessor is null → prompt
// to save first. The token NEVER leaves memory (NFR-11).
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
      <p className="mute" data-testid="oidc-provider-pending" style={{ fontSize: 11 }}>
        Save to start the OIDC session — the app reloads to connect to your identity provider.
      </p>
    );
  }
  if (accessor.isAuthenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
      onClick={() => accessor.signIn()}
    >
      Sign in with your identity provider
    </button>
  );
}

export function SettingsAuthTab() {
  const [conn, setConn] = React.useState<SavedConnection | null>(() => getActiveConnection());
  const [st, setSt] = React.useState<AuthTabState>(() => hydrateAuthTab(conn));
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Re-hydrate when the active connection changes (Topbar quick-switch / Manage
  // dropdown) so the tab always reflects the live active connection.
  React.useEffect(() => {
    const handler = () => {
      const c = getActiveConnection();
      setConn(c);
      setSt(hydrateAuthTab(c));
      setError(null);
    };
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, handler);
    return () => window.removeEventListener(SAVED_CONNECTIONS_CHANGED, handler);
  }, []);

  const setField = <K extends keyof AuthTabState>(key: K, value: AuthTabState[K]) =>
    setSt((prev) => ({ ...prev, [key]: value }));

  const switchKind = (next: AuthStrategyKind) => {
    if (next === st.kind) return;
    setSt((prev) => ({
      ...prev,
      kind: next,
      bearerToken: "",
      oidcIssuer: "",
      oidcClientId: "",
      oidcScopes: "",
      username: "",
      password: "",
    }));
  };

  if (!conn) {
    return (
      <div className="modal-bd">
        <p className="mute" data-testid="auth-tab-no-connection">
          No active connection. Add or select one in the Connection tab first.
        </p>
      </div>
    );
  }

  const built = parseAuthStrategyConfig(buildAuthTabConfig(st));
  const persisted = conn.authStrategyConfig ?? null;
  // diff-empty no-op guard (mirrors the Edit modal): disable Save when the
  // would-be config equals the persisted one.
  const diffEmpty =
    built.ok && persisted !== null && JSON.stringify(built.value) === JSON.stringify(persisted);
  const perKindFilled =
    (st.kind !== "bearer" || st.bearerToken.trim() !== "") &&
    (st.kind !== "oidc" ||
      (st.oidcIssuer.trim() !== "" &&
        st.oidcClientId.trim() !== "" &&
        st.oidcScopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean).length > 0));
  const canSave = !busy && !diffEmpty && perKindFilled;

  const save = () => {
    setError(null);
    const parsed = parseAuthStrategyConfig(buildAuthTabConfig(st));
    if (!parsed.ok) {
      setError(new Error(formatErrors(parsed.errors)));
      return;
    }
    setBusy(true);
    try {
      const patch: Partial<Omit<SavedConnection, "id">> = { authStrategyConfig: parsed.value };
      // Keep the legacy top-level username/password in sync for Basic so the
      // runtime cfg (Story 23.1 setActiveConnection write-through) stays
      // consistent; drop them (tombstone) for Bearer/OIDC.
      if (st.kind === "basic") {
        patch.username = st.username;
        patch.password = st.password;
      } else {
        if (conn.username !== undefined) patch.username = undefined;
        if (conn.password !== undefined) patch.password = undefined;
      }
      const updated = updateConnection(conn.id, patch);
      // Re-install so the change applies without a reload (Basic/Bearer).
      installStrategyForActiveConnection();
      setConn(updated);
      setSt(hydrateAuthTab(updated));
      setBusy(false);
      toast({ kind: "ok", text: "Authentication updated", ttl: 3000 });
      // Story 28.4: switching INTO / OUT OF OIDC needs <AuthProvider> remounted
      // with the new config (render-time). Guarded reload (no-op when the
      // provider state already matches the saved kind).
      reloadIfOidcProviderMismatch();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="modal-bd">
        <div className="form-row" style={{ marginBottom: 4 }}>
          <span className="mute text-xs" data-testid="auth-tab-active-label">
            Authentication for: <b style={{ fontWeight: 600 }}>{conn.label}</b>
          </span>
        </div>
        {error && (
          <div style={{ marginBottom: 12 }} data-testid="auth-tab-error">
            <ErrorBox error={error} />
          </div>
        )}
        <div style={{ display: "grid", gap: 10 }}>
          <AuthStrategyFields
            idPrefix="auth-tab"
            kind={st.kind}
            onKindChange={switchKind}
            username={st.username}
            onUsernameChange={(v) => setField("username", v)}
            password={st.password}
            onPasswordChange={(v) => setField("password", v)}
            bearerToken={st.bearerToken}
            onBearerTokenChange={(v) => setField("bearerToken", v)}
            oidcIssuer={st.oidcIssuer}
            onOidcIssuerChange={(v) => setField("oidcIssuer", v)}
            oidcClientId={st.oidcClientId}
            onOidcClientIdChange={(v) => setField("oidcClientId", v)}
            oidcScopes={st.oidcScopes}
            onOidcScopesChange={(v) => setField("oidcScopes", v)}
            disabled={busy}
          />
          {st.kind === "oidc" && <OidcSignInOut />}
        </div>
      </div>
      <div className="modal-ft">
        <button
          type="button"
          className="btn"
          data-variant="primary"
          data-testid="auth-tab-save"
          onClick={save}
          disabled={!canSave}
        >
          {busy ? "Saving…" : "Save authentication"}
        </button>
      </div>
    </>
  );
}
