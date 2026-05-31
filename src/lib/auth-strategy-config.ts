// SPDX-License-Identifier: Apache-2.0

/**
 * Per-connection auth-strategy config (Story 23.2 — FR-49 close).
 *
 * Discriminated union narrowed from Story 23.1's permissive
 * `{kind, config: Record<string, unknown>}` slot to the strict per-kind
 * shape AND a hand-written Zod-style validator that returns a parse-result
 * (no Zod npm install — error messages mirror Zod verbatim so a future
 * library migration is a 1-line swap).
 *
 * Persistence-only contract:
 * - Active runtime call path stays Basic auth on `cfg.{username, password}`.
 *   Story 28.1 lands the `AuthStrategy` interface refactor that activates
 *   Bearer / OIDC at the request funnel.
 * - OIDC tokens MUST NOT live in localStorage (NFR-11 / ADR-009); the OIDC
 *   variant here carries only `{issuer, clientId, scopes}` — tokens land in
 *   Story 28.4's in-memory store.
 * - Bearer mode's `{token}` IS in localStorage (operator-pasted long-lived
 *   token, parity with Basic credentials; documented + flagged in UI help
 *   text on the modal).
 *
 * Validation strength is SHAPE-ONLY: required fields present + each is a
 * non-empty trimmed string. Engine-side validation lands in Story 28.x when
 * the runtime path activates.
 */

export type AuthStrategyKind = "basic" | "bearer" | "oidc";

export type AuthStrategyConfig =
  | { kind: "basic"; config: { username: string; password: string } }
  | { kind: "bearer"; config: { token: string } }
  | { kind: "oidc"; config: { issuer: string; clientId: string; scopes: string[] } };

export type ParseResult = { ok: true; value: AuthStrategyConfig } | { ok: false; errors: string[] };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Parse + narrow an unknown value into a strict {@link AuthStrategyConfig}.
 * Errors are accumulated (NOT short-circuited on first failure) so the
 * operator fixes everything at once. Error wording mirrors Zod verbatim
 * ("Expected <T>, received <U>" / "Required" / "Must be a non-empty <X>").
 */
export function parseAuthStrategyConfig(value: unknown): ParseResult {
  if (value === null || value === undefined) {
    return { ok: false, errors: ["Required"] };
  }
  if (!isPlainObject(value)) {
    return { ok: false, errors: [`Expected object, received ${typeof value}`] };
  }
  const { kind } = value;
  if (kind !== "basic" && kind !== "bearer" && kind !== "oidc") {
    return { ok: false, errors: ["kind: Must be one of 'basic' | 'bearer' | 'oidc'"] };
  }
  const config = (value as { config?: unknown }).config;
  if (!isPlainObject(config)) {
    return { ok: false, errors: [`config: Expected object, received ${typeof config}`] };
  }

  const errors: string[] = [];

  if (kind === "basic") {
    const username = config.username;
    const password = config.password;
    if (username === undefined) errors.push("config.username: Required");
    else if (typeof username !== "string")
      errors.push(`config.username: Expected string, received ${typeof username}`);
    if (password === undefined) errors.push("config.password: Required");
    else if (typeof password !== "string")
      errors.push(`config.password: Expected string, received ${typeof password}`);
    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      value: {
        kind: "basic",
        config: { username: username as string, password: password as string },
      },
    };
  }

  if (kind === "bearer") {
    const token = config.token;
    if (token === undefined) errors.push("config.token: Required");
    else if (typeof token !== "string")
      errors.push(`config.token: Expected string, received ${typeof token}`);
    else if (token.trim() === "") errors.push("config.token: Must be a non-empty string");
    if (errors.length > 0) return { ok: false, errors };
    return { ok: true, value: { kind: "bearer", config: { token: token as string } } };
  }

  // kind === "oidc"
  const issuer = config.issuer;
  const clientId = config.clientId;
  const scopes = config.scopes;

  if (issuer === undefined) errors.push("config.issuer: Required");
  else if (typeof issuer !== "string")
    errors.push(`config.issuer: Expected string, received ${typeof issuer}`);
  else if (issuer.trim() === "") errors.push("config.issuer: Must be a non-empty string");
  else {
    try {
      new URL(issuer.trim());
    } catch {
      errors.push("config.issuer: Must be a valid URL");
    }
  }

  if (clientId === undefined) errors.push("config.clientId: Required");
  else if (typeof clientId !== "string")
    errors.push(`config.clientId: Expected string, received ${typeof clientId}`);
  else if (clientId.trim() === "") errors.push("config.clientId: Must be a non-empty string");

  if (scopes === undefined) errors.push("config.scopes: Required");
  else if (!isStringArray(scopes))
    errors.push("config.scopes: Expected string[], received non-string-array");
  else if (scopes.filter((s) => s.trim() !== "").length === 0)
    errors.push("config.scopes: Must contain at least one scope");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: "oidc",
      config: {
        issuer: (issuer as string).trim(),
        clientId: (clientId as string).trim(),
        scopes: (scopes as string[]).map((s) => s.trim()).filter(Boolean),
      },
    },
  };
}

/** Render the validator's errors as a single newline-joined string. */
export function formatErrors(errors: string[]): string {
  return errors.join("\n");
}
