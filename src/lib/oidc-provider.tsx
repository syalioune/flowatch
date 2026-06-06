// SPDX-License-Identifier: Apache-2.0

/**
 * OIDC React provider + token bridge (Story 28.4).
 *
 * This file is the ONLY static importer of `react-oidc-context` /
 * `oidc-client-ts`, and it is itself imported DYNAMICALLY by main.tsx only when
 * the active connection is OIDC — so the `oidc` Vite chunk (ADR-009) loads on
 * demand, never for Basic/Bearer users.
 *
 * `OidcTokenBridge` bridges react-oidc-context's React-only `useAuth()` to the
 * plain-class `OidcAuthStrategy` via the module-scoped singleton in
 * [oidc-accessor.ts](./oidc-accessor.ts). The token NEVER leaves memory
 * (react-oidc-context default in-memory `userStore`; we pass NO
 * WebStorageStateStore — NFR-11).
 */

import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider, useAuth } from "react-oidc-context";
import {
  markOidcProviderMounted,
  OIDC_AUTH_CHANGED,
  type OidcProviderConfig,
  setOidcTokenAccessor,
} from "./oidc-accessor";

/** Strip the `?code=&state=` params after the IdP callback (no history entry). */
function cleanCallbackUrl(): void {
  try {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.hash,
    );
  } catch {
    /* non-DOM */
  }
}

export function OidcTokenBridge() {
  const auth = useAuth();
  useEffect(() => {
    setOidcTokenAccessor({
      getToken: async () => {
        if (auth.isAuthenticated && auth.user) return auth.user.access_token;
        // Not authenticated yet — attempt a silent renew if a session exists.
        try {
          const u = await auth.signinSilent();
          return u?.access_token ?? null;
        } catch {
          return null;
        }
      },
      signIn: () => void auth.signinRedirect(),
      signOut: () => void auth.signoutRedirect(),
      isAuthenticated: auth.isAuthenticated,
      username:
        (auth.user?.profile?.preferred_username as string | undefined) ??
        (auth.user?.profile?.email as string | undefined) ??
        null,
    });
    window.dispatchEvent(new CustomEvent(OIDC_AUTH_CHANGED));
    return () => setOidcTokenAccessor(null);
  }, [auth]);
  return null;
}

/**
 * Mount the React tree wrapped in `<AuthProvider>` configured from the active
 * OIDC connection. Called by main.tsx (dynamic import) when an OIDC connection
 * is active. `key` forces a clean remount when the issuer/clientId changes.
 */
export function renderWithOidc(
  rootEl: HTMLElement,
  tree: React.ReactNode,
  oidcCfg: OidcProviderConfig,
): void {
  markOidcProviderMounted();
  ReactDOM.createRoot(rootEl).render(
    <AuthProvider
      authority={oidcCfg.authority}
      client_id={oidcCfg.client_id}
      scope={oidcCfg.scope}
      redirect_uri={oidcCfg.redirect_uri}
      response_type={oidcCfg.response_type}
      automaticSilentRenew
      onSigninCallback={cleanCallbackUrl}
      key={`${oidcCfg.authority}|${oidcCfg.client_id}`}
    >
      <OidcTokenBridge />
      {tree}
    </AuthProvider>,
  );
}
