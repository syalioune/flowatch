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
 *   3. Settings → Authentication tab Save — apply without a reload.
 *
 * Per-kind branches: `basic` installs the live BasicAuthStrategy (Story 28.1);
 * `bearer` / `oidc` install a DormantAuthStrategy placeholder until Story 28.3
 * (bearer) / Story 28.4 (oidc) swap them for the real concrete. The dormancy
 * placeholder still produces a Basic header from `api.config()` so a
 * bearer/oidc connection activated before its concrete lands still sends
 * SOMETHING (matches Story 23.2's documented dormancy contract).
 */

import { api } from "../api";
import { type AuthStrategy, BasicAuthStrategy, BearerAuthStrategy } from "./auth-strategy";
import type { AuthStrategyKind } from "./auth-strategy-config";
import { OPEN_SETTINGS_AUTH } from "./nav-events";
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
 * Placeholder for a not-yet-implemented auth kind (bearer until 28.3, oidc
 * until 28.4). Carries the requested `kind` so `getAuthStrategy().kind`
 * reflects the operator's choice, but produces a Basic header from the active
 * cfg — the engine still receives credentials if any are set.
 */
export class DormantAuthStrategy implements AuthStrategy {
  readonly kind: AuthStrategyKind;
  constructor(kind: AuthStrategyKind) {
    this.kind = kind;
  }
  async authorizationHeader(): Promise<string | null> {
    const { username, password } = api.config();
    return `Basic ${btoa(`${username}:${password}`)}`;
  }
  // No onUnauthorized — dormant placeholder has no recovery.
}

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
      // Story 28.4 swaps this for `new OidcAuthStrategy()`.
      strategy = new DormantAuthStrategy("oidc");
      break;
    default:
      strategy = new BasicAuthStrategy(() => {
        const c = api.config();
        return { username: c.username, password: c.password };
      });
  }
  api.setAuthStrategy(strategy);
}
