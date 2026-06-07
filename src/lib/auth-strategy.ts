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

/**
 * Bearer (paste-a-token) concrete (Story 28.3 — the N=2 strategy).
 *
 * Produces `Authorization: Bearer <token>` from the active connection's
 * persisted `authStrategyConfig.config.token` (Story 23.2 storage). The token
 * is OPAQUE to Flowatch — NO JWT parse, NO `exp` check, NO refresh (refresh is
 * OIDC's job, Story 28.4). An expired token → engine 401 → `onUnauthorized()`
 * opens Settings at the Auth tab for a re-paste.
 *
 * Storage posture: the token persists in plaintext localStorage (Story 23.2
 * AC-7 — parity with Basic credentials; the `auth-bearer-help` advisory warns
 * the operator).
 *
 * Both constructor args are getters/callbacks (not snapshots / direct imports):
 * - `token: () => string` reads the active connection's token LIVE each call,
 *   so a re-paste in Settings takes effect without re-installing the strategy
 *   (mirrors BasicAuthStrategy's creds getter). Empty/whitespace token →
 *   `null` → no Authorization header → engine 401 → onUnauthorized recovers.
 * - `onAuthFailure: () => void` is INJECTED (not a direct app/event import) so
 *   `auth-strategy.ts` stays free of app/event dependencies. The dispatcher
 *   (install-auth-strategy.ts) wires it to dispatch OPEN_SETTINGS_AUTH.
 */
export class BearerAuthStrategy implements AuthStrategy {
  readonly kind = "bearer" as const;
  private readonly token: () => string;
  private readonly onAuthFailure: () => void;
  constructor(token: () => string, onAuthFailure: () => void) {
    this.token = token;
    this.onAuthFailure = onAuthFailure;
  }
  async authorizationHeader(): Promise<string | null> {
    const t = this.token().trim();
    return t === "" ? null : `Bearer ${t}`;
  }
  async onUnauthorized(): Promise<void> {
    this.onAuthFailure();
  }
}

/**
 * Minimal structural view of the OIDC token accessor (Story 28.4). Declared
 * locally so `auth-strategy.ts` stays free of any `react-oidc-context` /
 * bridge import — the dispatcher injects a getter that returns the real
 * accessor (or null when the provider isn't mounted).
 */
export interface OidcAccessorLike {
  getToken(): Promise<string | null>;
  /** Best-effort silent renew (no redirect). */
  renewSilent(): void;
}

/**
 * OIDC (Authorization Code + PKCE) concrete (Story 28.4 — the N=3 strategy).
 *
 * `authorizationHeader()` is the async seam's payoff (Story 28.1 made it async
 * FOR this): it `await`s the bridge accessor's `getToken()` (in-memory access
 * token; `automaticSilentRenew` keeps it fresh). `null` (not signed in) → no
 * header.
 *
 * `onUnauthorized()` does a DEBOUNCED, best-effort SILENT renew — it does NOT
 * interactive-redirect. A resource-server 401 (e.g. a Basic-only Flowable
 * engine rejecting the OIDC JWT, per ADR-009 / RC-18) must NEVER escalate to a
 * top-level `signinRedirect()`: that produces an infinite redirect loop
 * (every call 401s → redirect → back → 401 → …). Interactive sign-in is
 * USER-initiated via the Auth-tab button only. The debounce stops a 401-storm
 * from firing many silent renews.
 *
 * The accessor is INJECTED via a getter (not imported) so this file never pulls
 * in react-oidc-context — preserving the OIDC tree-shake (ADR-009) and keeping
 * `auth-strategy.ts` React-free. NFR-11: the token lives only in the bridge's
 * in-memory store; this class never persists it.
 */
export class OidcAuthStrategy implements AuthStrategy {
  readonly kind = "oidc" as const;
  private readonly accessor: () => OidcAccessorLike | null;
  private lastRenewAt = 0;
  constructor(accessor: () => OidcAccessorLike | null) {
    this.accessor = accessor;
  }
  async authorizationHeader(): Promise<string | null> {
    const token = (await this.accessor()?.getToken()) ?? null;
    return token ? `Bearer ${token}` : null;
  }
  async onUnauthorized(): Promise<void> {
    // Debounce: at most one silent renew per 10s, regardless of how many
    // concurrent calls 401. No interactive redirect (loop guard).
    const now = Date.now();
    if (now - this.lastRenewAt < 10_000) return;
    this.lastRenewAt = now;
    this.accessor()?.renewSilent();
  }
}
