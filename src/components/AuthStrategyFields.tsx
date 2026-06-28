// SPDX-License-Identifier: Apache-2.0

/**
 * Shared auth-method field group (Story 28.2 — segmented-control N=3 extraction).
 *
 * Extracts the `role="radiogroup"` Basic/Bearer/OIDC segmented-control + the
 * conditional per-kind field group + the dormancy note that Story 23.2 shipped
 * INLINE in both connection modals. N=3 consumers — Add modal, Edit modal, and
 * the Story 28.2 Settings → Authentication tab — is the documented extraction
 * trigger per CLAUDE.md "Segmented-control mode-toggle inside a modal" (the
 * N=3-codifies note). The `aria-pressed`-over-`role="radio"` keyboard shape was
 * re-evaluated at N=3 and KEPT (presentational extraction only; Tab in/out, no
 * roving tabindex — matches every other button-row in the app).
 *
 * CONTROLLED + presentational: the caller owns ALL state (kind + per-kind field
 * values) and the `switchKind` clear-exclusive logic. This component only
 * renders + wires onChange callbacks. The persisted 23.2 `data-testid`s are
 * preserved verbatim (`auth-kind-*`, `auth-bearer-token`, `auth-bearer-help`,
 * `auth-oidc-*`, `auth-dormancy-note`); the Basic username/password inputs
 * carry `${idPrefix}-username|password` so Add / Edit / Auth-tab stay distinct.
 *
 * Dormancy note: removed entirely at Story 28.4 — all three methods (Basic /
 * Bearer / OIDC) are live. (Was bearer+OIDC at 28.2, OIDC-only at 28.3.)
 */

import type React from "react";
import type { AuthStrategyKind } from "../lib/auth-strategy-config";

export interface AuthStrategyFieldsProps {
  /** Namespaces the `id`/`htmlFor` + Basic-field testids per mount point. */
  idPrefix: string;
  kind: AuthStrategyKind;
  /** Caller owns the clear-exclusive switchKind logic. */
  onKindChange: (k: AuthStrategyKind) => void;
  username: string;
  onUsernameChange: (v: string) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  bearerToken: string;
  onBearerTokenChange: (v: string) => void;
  oidcIssuer: string;
  onOidcIssuerChange: (v: string) => void;
  oidcClientId: string;
  onOidcClientIdChange: (v: string) => void;
  oidcScopes: string;
  onOidcScopesChange: (v: string) => void;
  disabled?: boolean;
}

export const AuthStrategyFields: React.FC<AuthStrategyFieldsProps> = ({
  idPrefix,
  kind,
  onKindChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  bearerToken,
  onBearerTokenChange,
  oidcIssuer,
  onOidcIssuerChange,
  oidcClientId,
  onOidcClientIdChange,
  oidcScopes,
  onOidcScopesChange,
  disabled = false,
}) => {
  return (
    <>
      <div>
        <label
          style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          htmlFor={`${idPrefix}-auth-kind-basic`}
        >
          Authentication
        </label>
        <div
          role="radiogroup"
          aria-label="Authentication method"
          style={{ display: "flex", gap: 6 }}
        >
          <button
            id={`${idPrefix}-auth-kind-basic`}
            type="button"
            className="btn"
            data-variant={kind === "basic" ? "primary" : "ghost"}
            aria-pressed={kind === "basic"}
            data-testid="auth-kind-basic"
            onClick={() => onKindChange("basic")}
            disabled={disabled}
          >
            Basic
          </button>
          <button
            type="button"
            className="btn"
            data-variant={kind === "bearer" ? "primary" : "ghost"}
            aria-pressed={kind === "bearer"}
            data-testid="auth-kind-bearer"
            onClick={() => onKindChange("bearer")}
            disabled={disabled}
          >
            Bearer
          </button>
          <button
            type="button"
            className="btn"
            data-variant={kind === "oidc" ? "primary" : "ghost"}
            aria-pressed={kind === "oidc"}
            data-testid="auth-kind-oidc"
            onClick={() => onKindChange("oidc")}
            disabled={disabled}
          >
            OIDC
          </button>
        </div>
      </div>
      {kind === "bearer" && (
        <div>
          <label
            htmlFor={`${idPrefix}-bearer-token`}
            style={{ display: "block", marginBottom: 4, fontSize: 12 }}
          >
            Bearer token
          </label>
          <textarea
            id={`${idPrefix}-bearer-token`}
            data-testid="auth-bearer-token"
            rows={3}
            maxLength={4096}
            value={bearerToken}
            onChange={(e) => onBearerTokenChange(e.target.value)}
            disabled={disabled}
            style={{
              width: "100%",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              resize: "vertical",
            }}
          />
          <p className="mute" data-testid="auth-bearer-help" style={{ marginTop: 4, fontSize: 11 }}>
            Stored locally in plaintext — only paste tokens you'd treat as you treat a password.
          </p>
        </div>
      )}
      {kind === "oidc" && (
        <>
          <div>
            <label
              htmlFor={`${idPrefix}-oidc-issuer`}
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Issuer URL
            </label>
            <input
              id={`${idPrefix}-oidc-issuer`}
              data-testid="auth-oidc-issuer"
              type="text"
              value={oidcIssuer}
              onChange={(e) => onOidcIssuerChange(e.target.value)}
              disabled={disabled}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-oidc-client-id`}
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Client ID
            </label>
            <input
              id={`${idPrefix}-oidc-client-id`}
              data-testid="auth-oidc-client-id"
              type="text"
              value={oidcClientId}
              onChange={(e) => onOidcClientIdChange(e.target.value)}
              disabled={disabled}
              style={{ width: "100%", fontSize: 12 }}
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-oidc-scopes`}
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Scopes
            </label>
            <input
              id={`${idPrefix}-oidc-scopes`}
              data-testid="auth-oidc-scopes"
              type="text"
              value={oidcScopes}
              onChange={(e) => onOidcScopesChange(e.target.value)}
              disabled={disabled}
              placeholder="openid, profile, email, offline_access"
              style={{ width: "100%", fontSize: 12 }}
            />
          </div>
        </>
      )}
      {kind === "basic" && (
        <>
          <div>
            <label
              htmlFor={`${idPrefix}-username`}
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Username
            </label>
            <input
              id={`${idPrefix}-username`}
              data-testid={`${idPrefix}-username`}
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              disabled={disabled}
              maxLength={255}
              style={{ width: "100%", fontSize: 12 }}
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-password`}
              style={{ display: "block", marginBottom: 4, fontSize: 12 }}
            >
              Password
            </label>
            <input
              id={`${idPrefix}-password`}
              data-testid={`${idPrefix}-password`}
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              disabled={disabled}
              maxLength={255}
              style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}
            />
          </div>
        </>
      )}
    </>
  );
};
