// SPDX-License-Identifier: Apache-2.0

/**
 * Auth-strategy install dispatcher (Story 28.2 — activates Story 23.2's dormant
 * per-connection `authStrategyConfig`).
 *
 * Lives at the lib/app layer — NOT inside `src/api.ts` — to avoid an import
 * cycle: `api.ts` exports `setAuthStrategy`; `saved-connections.ts` imports
 * `api` (legacy write-through); a dispatcher inside `api.ts` would need
 * `saved-connections` → `api ← saved-connections ← api`. This module sits
 * ABOVE both: it imports `api` + `saved-connections` + the strategy classes
 * and calls `api.setAuthStrategy(...)`. Story 28.3/28.4 add their strategy
 * import HERE, never to `api.ts`.
 *
 * Fired at three points (Story 28.2):
 *   1. App mount (src/app.tsx) — honour the persisted active connection's kind.
 *   2. SAVED_CONNECTIONS_CHANGED listener (src/app.tsx) — re-install on switch.
 *   3. Settings → Authentication tab Save — apply immediately.
 *
 * Per-kind branches (all live as of Epic 28): `basic` → BasicAuthStrategy
 * (Story 28.1); `bearer` → BearerAuthStrategy (Story 28.3); `oidc` →
 * OidcAuthStrategy reading the in-memory bridge accessor (Story 28.4). The
 * earlier DormantAuthStrategy placeholder was removed once all three concretes
 * landed. Switching into/out-of OIDC additionally needs a guarded reload (see
 * {@link reloadIfOidcProviderMismatch}) because <AuthProvider> is render-time.
 */

import { api } from "../api";
import {
  type AuthStrategy,
  BasicAuthStrategy,
  BearerAuthStrategy,
  OidcAuthStrategy,
} from "./auth-strategy";
import type { AuthStrategyKind } from "./auth-strategy-config";
import { OPEN_SETTINGS_AUTH } from "./nav-events";
import { getOidcTokenAccessor, isOidcProviderMounted } from "./oidc-accessor";
import { getActiveConnection } from "./saved-connections";

/** Open the Settings modal at the Authentication tab (Story 28.3 401 recovery). */
const dispatchOpenSettingsAuth = (): void => {
  try {
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_AUTH));
  } catch {
    /* SSR / non-DOM context */
  }
};

/** Live-read the active connection's Bearer token (empty when not bearer-kind). */
const activeBearerToken = (): string => {
  const c = getActiveConnection();
  return c?.authStrategyConfig?.kind === "bearer" ? c.authStrategyConfig.config.token : "";
};

/**
 * Read the active connection's `authStrategyConfig.kind` and install the
 * matching {@link AuthStrategy} into the api funnel. Defaults to `basic` when
 * no active connection / no config.
 */
export function installStrategyForActiveConnection(): void {
  const conn = getActiveConnection();
  const kind: AuthStrategyKind = conn?.authStrategyConfig?.kind ?? "basic";
  let strategy: AuthStrategy;
  switch (kind) {
    case "bearer":
      // Story 28.3: live token read (re-paste in Settings takes effect without
      // re-install) + open-Settings-at-Auth-tab on 401.
      strategy = new BearerAuthStrategy(activeBearerToken, dispatchOpenSettingsAuth);
      break;
    case "oidc":
      // Story 28.4: reads the in-memory token via the bridge accessor (injected
      // getter — keeps auth-strategy.ts React-free). The <AuthProvider> is
      // mounted by main.tsx; switch-into-OIDC at runtime reloads (see
      // reloadIfOidcProviderMismatch) so the provider remounts with the config.
      strategy = new OidcAuthStrategy(getOidcTokenAccessor);
      break;
    default:
      strategy = new BasicAuthStrategy(() => {
        const c = api.config();
        return { username: c.username, password: c.password };
      });
  }
  api.setAuthStrategy(strategy);
}

/**
 * Story 28.4: `<AuthProvider>` is configured at root render (main.tsx) from the
 * active OIDC connection. Switching INTO OIDC at runtime (Auth-tab Save / Topbar
 * quick-switch) needs the provider with the new config, and switching OUT needs
 * it torn down. Because the provider config is render-time, the simplest correct
 * behaviour is a guarded `window.location.reload()` when the desired provider
 * state (active kind === "oidc") differs from what mounted at page load.
 *
 * Called from the connection-switch + Auth-tab-Save paths (NOT app mount — at
 * mount the desired state always matches what main.tsx already mounted, so this
 * no-ops and cannot loop). Documented as the deliberate scope boundary; a fully
 * dynamic provider swap without reload is a future refinement (deferred-work).
 */
/** sessionStorage key: when set, app.tsx opens Settings (Connection tab) after reload. */
export const REOPEN_SETTINGS_AFTER_RELOAD_KEY = "flowatch.reopen-settings-after-reload";

export function reloadIfOidcProviderMismatch(): void {
  const conn = getActiveConnection();
  const wantOidc = conn?.authStrategyConfig?.kind === "oidc";
  if (wantOidc === isOidcProviderMounted()) return;
  try {
    // When switching INTO OIDC the operator needs to sign in immediately after
    // the provider mounts — persist a flag so app.tsx re-opens Settings
    // (Connection tab) on the post-reload paint.
    if (wantOidc) {
      sessionStorage.setItem(REOPEN_SETTINGS_AFTER_RELOAD_KEY, "1");
    }
    window.dispatchEvent(
      new CustomEvent("app:toast", {
        detail: { kind: "ok", text: "Reloading to apply the authentication change…", ttl: 2000 },
      }),
    );
    window.location.reload();
  } catch {
    /* non-DOM */
  }
}
