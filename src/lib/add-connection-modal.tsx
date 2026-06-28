// SPDX-License-Identifier: Apache-2.0

/**
 * Add-connection modal (Story 23.1) — 26th modal in the catalogue.
 *
 * Retryable-creation archetype — mirrors `<CreateUserModal>` (Story 22.1)
 * 5-field shape. Persists a new {@link SavedConnection} via the
 * `addConnection` wrapper from `src/lib/saved-connections.ts`; the wrapper
 * dispatches `SAVED_CONNECTIONS_CHANGED` so listeners (Settings Manage panel,
 * Topbar picker) re-read without prop drilling.
 *
 * Failure path renders an in-modal {@link ErrorBox} — label collision OR
 * URL parse failure OR localStorage quota error. Form values preserved on
 * retry per the Story 10.2 retryable-creation convention.
 *
 * ARIA convention (Epic 18.2): role="dialog" + aria-modal + aria-labelledby
 * on day one. The `[data-testid="open-inspector"]` button on the ErrorBox
 * fires harmlessly here (no API_LOG entry for localStorage throws) — kept
 * for shape parity rather than per-source-of-error specialization.
 */

import React from "react";
import { Icon } from "../components";
import { AuthStrategyFields } from "../components/AuthStrategyFields";
import { SubAppPrefixFields } from "../components/SubAppPrefixFields";
import {
  type AuthStrategyKind,
  formatErrors,
  parseAuthStrategyConfig,
} from "./auth-strategy-config";
import { ErrorBox } from "./error-box";
import { addConnection, normalizePrefix, type SavedConnection } from "./saved-connections";

export interface AddConnectionModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after a successful add. */
  onSuccess: (created: SavedConnection) => void;
  /** Focus-restore target (CLAUDE.md "Modal focus-restore via triggerRef"). */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export const AddConnectionModal: React.FC<AddConnectionModalProps> = ({
  open,
  onClose,
  onSuccess,
  triggerRef,
}) => {
  const [label, setLabel] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  // Story 23.2: segmented-control archetype N=2 (after <AddAttachmentModal>
  // Story 21.2). Per CLAUDE.md "Segmented-control mode-toggle inside a modal"
  // the shape is inline-keep-not-extract until N=3 (projected: Story 27
  // new-version-from vs from-current). Do NOT extract a <SegmentedControl>
  // helper here.
  const [kind, setKind] = React.useState<AuthStrategyKind>("basic");
  const [bearerToken, setBearerToken] = React.useState("");
  const [oidcIssuer, setOidcIssuer] = React.useState("");
  const [oidcClientId, setOidcClientId] = React.useState("");
  const [oidcScopes, setOidcScopes] = React.useState("");
  // Story 34.1: per-sub-app URI prefix overrides. Blank → no override (default).
  const [servicePath, setServicePath] = React.useState("");
  const [dmnPath, setDmnPath] = React.useState("");
  const [cmmnPath, setCmmnPath] = React.useState("");
  const [appPath, setAppPath] = React.useState("");
  const [error, setError] = React.useState<Error | null>(null);
  const [busy, setBusy] = React.useState(false);
  const labelRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLabel("");
    setBaseUrl("");
    setUsername("");
    setPassword("");
    setTenantId("");
    setKind("basic");
    setBearerToken("");
    setOidcIssuer("");
    setOidcClientId("");
    setOidcScopes("");
    setServicePath("");
    setDmnPath("");
    setCmmnPath("");
    setAppPath("");
    setError(null);
    setBusy(false);
    setTimeout(() => labelRef.current?.focus(), 0);
  }, [open]);

  const switchKind = (next: AuthStrategyKind) => {
    if (next === kind) return;
    // Mode-switch clears every kind-exclusive field. username/password are
    // Basic-exclusive (Story 23.2 follow-up) — clear them when leaving
    // Basic AND when entering Basic the operator types them fresh.
    setBearerToken("");
    setOidcIssuer("");
    setOidcClientId("");
    setOidcScopes("");
    setUsername("");
    setPassword("");
    setKind(next);
  };

  React.useEffect(() => {
    if (!open || busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        triggerRef?.current?.focus();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose, triggerRef]);

  if (!open) return null;

  const closeWithFocus = () => {
    triggerRef?.current?.focus();
    onClose();
  };

  const canSubmit =
    !busy &&
    label.trim() !== "" &&
    baseUrl.trim() !== "" &&
    (kind !== "bearer" || bearerToken.trim() !== "") &&
    (kind !== "oidc" ||
      (oidcIssuer.trim() !== "" &&
        oidcClientId.trim() !== "" &&
        oidcScopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean).length > 0));

  const buildAuthStrategyConfig = (): unknown => {
    if (kind === "basic") {
      return { kind: "basic", config: { username, password } };
    }
    if (kind === "bearer") {
      // Review patch: trim — `canSubmit` already requires `bearerToken.trim()`
      // to be non-empty; persist the trimmed form so the Authorization header
      // never picks up trailing whitespace on activation.
      return { kind: "bearer", config: { token: bearerToken.trim() } };
    }
    return {
      kind: "oidc",
      config: {
        issuer: oidcIssuer.trim(),
        clientId: oidcClientId.trim(),
        scopes: oidcScopes
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      },
    };
  };

  const submit = () => {
    if (!canSubmit) return;
    setError(null);
    try {
      new URL(baseUrl.trim());
    } catch {
      setError(new Error("Invalid URL"));
      return;
    }
    const parsed = parseAuthStrategyConfig(buildAuthStrategyConfig());
    if (!parsed.ok) {
      setError(new Error(formatErrors(parsed.errors)));
      return;
    }
    setBusy(true);
    try {
      const payload: Omit<SavedConnection, "id"> = {
        label: label.trim(),
        baseUrl: baseUrl.trim(),
        tenantId,
        authStrategyConfig: parsed.value,
      };
      // Story 23.2 follow-up: username/password are Basic-exclusive —
      // omitted entirely for Bearer / OIDC so the persisted model doesn't
      // carry empty credentials.
      if (kind === "basic") {
        payload.username = username;
        payload.password = password;
      }
      // Story 34.1: blank → no override (omitted); non-blank → normalizePrefix.
      const sp = normalizePrefix(servicePath);
      const dp = normalizePrefix(dmnPath);
      const cp = normalizePrefix(cmmnPath);
      const ap = normalizePrefix(appPath);
      if (sp !== undefined) payload.servicePath = sp;
      if (dp !== undefined) payload.dmnPath = dp;
      if (cp !== undefined) payload.cmmnPath = cp;
      if (ap !== undefined) payload.appPath = ap;
      const created = addConnection(payload);
      setBusy(false);
      onSuccess(created);
      closeWithFocus();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setBusy(false);
    }
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop is mouse-dismissal; keyboard Escape handler lives on the document
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is a decorative click target; the modal itself owns interactivity
    <div
      className="modal-back"
      data-testid="add-connection-modal"
      onClick={() => {
        if (!busy) closeWithFocus();
      }}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive role on the panel itself */}
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-connection-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560 }}
      >
        <div className="modal-hd">
          <h3 id="add-connection-title">Add connection</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={closeWithFocus}
            disabled={busy}
            aria-label="Close add connection modal"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) submit();
          }}
        >
          <div className="modal-bd">
            {error && (
              <div style={{ marginBottom: 12 }}>
                <ErrorBox error={error} />
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label
                  htmlFor="add-connection-label"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Label
                </label>
                <input
                  ref={labelRef}
                  id="add-connection-label"
                  data-testid="add-connection-label"
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  placeholder="e.g. staging"
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              <div>
                <label
                  htmlFor="add-connection-base-url"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Base URL
                </label>
                <input
                  id="add-connection-base-url"
                  data-testid="add-connection-base-url"
                  type="text"
                  required
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={busy}
                  placeholder="http://localhost:8080"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
                />
              </div>
              {/* Story 28.2: segmented-control + per-kind fields extracted to
                  <AuthStrategyFields> (N=3 extraction). State + switchKind stay here. */}
              <AuthStrategyFields
                idPrefix="add-connection"
                kind={kind}
                onKindChange={switchKind}
                username={username}
                onUsernameChange={setUsername}
                password={password}
                onPasswordChange={setPassword}
                bearerToken={bearerToken}
                onBearerTokenChange={setBearerToken}
                oidcIssuer={oidcIssuer}
                onOidcIssuerChange={setOidcIssuer}
                oidcClientId={oidcClientId}
                onOidcClientIdChange={setOidcClientId}
                oidcScopes={oidcScopes}
                onOidcScopesChange={setOidcScopes}
                disabled={busy}
              />
              <div>
                <label
                  htmlFor="add-connection-tenant-id"
                  style={{ display: "block", marginBottom: 4, fontSize: 12 }}
                >
                  Tenant ID <span className="mute">(optional)</span>
                </label>
                <input
                  id="add-connection-tenant-id"
                  data-testid="add-connection-tenant-id"
                  type="text"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                  placeholder="leave blank for default"
                  style={{ width: "100%", fontSize: 12 }}
                />
              </div>
              {/* Story 34.1: per-sub-app URI prefix overrides (N=3 idPrefix
                  extraction). State stays here; blank → no override on submit. */}
              <SubAppPrefixFields
                idPrefix="add-connection"
                servicePath={servicePath}
                onServicePathChange={setServicePath}
                dmnPath={dmnPath}
                onDmnPathChange={setDmnPath}
                cmmnPath={cmmnPath}
                onCmmnPathChange={setCmmnPath}
                appPath={appPath}
                onAppPathChange={setAppPath}
                disabled={busy}
                baseUrl={baseUrl}
              />
            </div>
          </div>
          <div className="modal-ft">
            <button
              type="button"
              className="btn"
              data-testid="add-connection-cancel"
              onClick={closeWithFocus}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              data-variant="primary"
              data-testid="add-connection-submit"
              disabled={!canSubmit}
            >
              {busy ? "Adding…" : "Add connection"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
