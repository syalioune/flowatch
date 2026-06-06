// SPDX-License-Identifier: Apache-2.0

/**
 * Pluggable AuthStrategy seam (Story 28.1 — ADR-009 foundation, FR-4).
 *
 * `src/api.ts`'s `request()` + `multipartFetch()` no longer hard-code Basic
 * auth: they delegate `Authorization` header production to the active
 * {@link AuthStrategy}. Adding Bearer (Story 28.3) or OIDC (Story 28.4) means
 * writing ONE new strategy class + a dispatcher entry — the funnel is never
 * re-edited.
 *
 * First runtime consumer of Story 23.2's {@link AuthStrategyConfig} — the
 * {@link AuthStrategyKind} discriminant is reused verbatim (no union
 * duplication).
 *
 * Concrete strategies:
 * - {@link BasicAuthStrategy} (this file, Story 28.1) — the module default.
 * - `BearerAuthStrategy` (Story 28.3) — `Bearer <token>` + open-Settings 401.
 * - `OidcAuthStrategy` (Story 28.4) — `Bearer <oidc-access-token>` from an
 *   in-memory store + silent-renew-on-401.
 */

import type { AuthStrategyKind } from "./auth-strategy-config";

export interface AuthStrategy {
  /** Discriminant matching the persisted {@link AuthStrategyConfig}.kind. */
  readonly kind: AuthStrategyKind;
  /**
   * Produce the Authorization header value (e.g. "Basic <b64>" / "Bearer
   * <tok>"). Async BY DESIGN — OIDC (Story 28.4) may refresh a token on
   * demand inside this call; making the funnel `await` it now means 28.4
   * drops in with zero funnel edits.
   *
   * Returns `null` when no header should be sent — `request()` omits the
   * `Authorization` header entirely. No concrete strategy returns `null`
   * unconditionally today; Bearer/OIDC return `null` when their token is
   * empty/absent (engine 401s → `onUnauthorized` recovers). The `| null`
   * widens ADR-009's `Promise<string>` deliberately for this case; do NOT
   * "fix" it back to `Promise<string>`.
   */
  authorizationHeader(): Promise<string | null>;
  /**
   * Optional 401-recovery hook. Called by `request()` when the engine returns
   * 401, BEFORE the error propagates (additive — never swallows the error).
   * Basic leaves it undefined (no recovery — wrong creds stay wrong). Bearer
   * (Story 28.3) opens Settings at the Auth tab; OIDC (Story 28.4) re-initiates
   * the PKCE flow / silent renew.
   */
  onUnauthorized?(): Promise<void>;
}

/**
 * Basic-auth concrete (Story 28.1) — the module default, observably identical
 * to the pre-refactor `basicAuth()` helper.
 *
 * Reads credentials via an INJECTED getter (not a snapshot) so `api.setConfig`
 * mutating `cfg.{username,password}` — including a connection switch through
 * `setActiveConnection` — is reflected on the next header WITHOUT re-installing
 * the strategy. A snapshot would go stale on the first connection switch.
 */
export class BasicAuthStrategy implements AuthStrategy {
  readonly kind = "basic" as const;
  // Explicit field (not a TS parameter-property) — the project's tsconfig
  // enables `erasableSyntaxOnly`, which forbids constructor parameter
  // properties.
  private readonly creds: () => { username: string; password: string };
  constructor(creds: () => { username: string; password: string }) {
    this.creds = creds;
  }
  async authorizationHeader(): Promise<string> {
    const { username, password } = this.creds();
    return `Basic ${btoa(`${username}:${password}`)}`;
  }
  // onUnauthorized intentionally undefined — Basic has no refresh recovery.
}
