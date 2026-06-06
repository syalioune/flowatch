// SPDX-License-Identifier: Apache-2.0

/**
 * OIDC token-accessor singleton + provider-config resolver (Story 28.4).
 *
 * Plain TS — NO `react-oidc-context` / `oidc-client-ts` import — so the OIDC
 * bundle stays tree-shaken out of the main chunk (ADR-009). The React bridge
 * ([src/lib/oidc-provider.tsx](./oidc-provider.tsx), dynamically imported by
 * main.tsx only when an OIDC connection is active) WRITES the accessor here;
 * `OidcAuthStrategy` + the Auth-tab sign-in/out UI READ it.
 *
 * NFR-11: the access + refresh tokens live ONLY in react-oidc-context's default
 * in-memory `userStore` — this module never persists them; it holds a function
 * reference (`getToken`) that returns the in-memory token on demand.
 */

import { getActiveConnection } from "./saved-connections";

/** Shape the React bridge publishes for the strategy + UI to consume. */
export interface OidcTokenAccessor {
  /** In-memory access token (silent-renews if needed); null when not signed in. */
  getToken: () => Promise<string | null>;
  signIn: () => void;
  signOut: () => void;
  isAuthenticated: boolean;
  /** preferred_username / email of the signed-in user, or null. */
  username: string | null;
}

let tokenAccessor: OidcTokenAccessor | null = null;
let providerMounted = false;

export function setOidcTokenAccessor(accessor: OidcTokenAccessor | null): void {
  tokenAccessor = accessor;
}
export function getOidcTokenAccessor(): OidcTokenAccessor | null {
  return tokenAccessor;
}

/** Set true by the OIDC provider when it mounts (page load with an OIDC active connection). */
export function markOidcProviderMounted(): void {
  providerMounted = true;
}
export function isOidcProviderMounted(): boolean {
  return providerMounted;
}

/** Dispatched by the bridge when auth state changes (sign-in / sign-out / renew). */
export const OIDC_AUTH_CHANGED = "oidc:auth-changed" as const;

export interface OidcProviderConfig {
  authority: string;
  client_id: string;
  scope: string;
  redirect_uri: string;
  response_type: "code";
}

/**
 * Map the active connection's OIDC config → react-oidc-context AuthProvider
 * props. Returns null when the active connection is not OIDC (so main.tsx omits
 * the provider — the tree-shake intent). NO `userStore` is set → tokens stay in
 * the default in-memory store (NFR-11).
 */
export function resolveOidcProviderConfig(): OidcProviderConfig | null {
  const c = getActiveConnection();
  if (c?.authStrategyConfig?.kind !== "oidc") return null;
  const { issuer, clientId, scopes } = c.authStrategyConfig.config;
  return {
    authority: issuer,
    client_id: clientId,
    scope: scopes.join(" "),
    redirect_uri: typeof window !== "undefined" ? window.location.origin : "",
    response_type: "code",
  };
}
