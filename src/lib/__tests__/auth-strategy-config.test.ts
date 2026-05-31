// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for `parseAuthStrategyConfig` (Story 23.2 — FR-49 close).
 * Hand-written Zod-style validator; error messages mirror Zod verbatim so a
 * future library migration is a 1-line swap.
 */

import { describe, expect, it } from "vitest";
import { formatErrors, parseAuthStrategyConfig } from "../auth-strategy-config";

describe("parseAuthStrategyConfig", () => {
  it("null → Required", () => {
    const r = parseAuthStrategyConfig(null);
    expect(r).toEqual({ ok: false, errors: ["Required"] });
  });

  it("undefined → Required", () => {
    const r = parseAuthStrategyConfig(undefined);
    expect(r).toEqual({ ok: false, errors: ["Required"] });
  });

  it("non-object (string) → Expected object", () => {
    const r = parseAuthStrategyConfig("foo");
    expect(r).toEqual({ ok: false, errors: ["Expected object, received string"] });
  });

  it("non-object (array) → Expected object", () => {
    const r = parseAuthStrategyConfig([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Expected object/);
  });

  it("missing kind → kind: Must be one of …", () => {
    const r = parseAuthStrategyConfig({ config: {} });
    expect(r).toEqual({
      ok: false,
      errors: ["kind: Must be one of 'basic' | 'bearer' | 'oidc'"],
    });
  });

  it("unrecognized kind → kind: Must be one of …", () => {
    const r = parseAuthStrategyConfig({ kind: "foo", config: {} });
    expect(r).toEqual({
      ok: false,
      errors: ["kind: Must be one of 'basic' | 'bearer' | 'oidc'"],
    });
  });

  it("basic / valid → ok", () => {
    const r = parseAuthStrategyConfig({
      kind: "basic",
      config: { username: "u", password: "p" },
    });
    expect(r).toEqual({
      ok: true,
      value: { kind: "basic", config: { username: "u", password: "p" } },
    });
  });

  it("basic / missing password → config.password: Required", () => {
    const r = parseAuthStrategyConfig({ kind: "basic", config: { username: "u" } });
    expect(r).toEqual({ ok: false, errors: ["config.password: Required"] });
  });

  it("basic / empty strings allowed (parity with legacy cfg)", () => {
    const r = parseAuthStrategyConfig({ kind: "basic", config: { username: "", password: "" } });
    expect(r.ok).toBe(true);
  });

  it("bearer / valid → ok", () => {
    const r = parseAuthStrategyConfig({ kind: "bearer", config: { token: "abc" } });
    expect(r).toEqual({ ok: true, value: { kind: "bearer", config: { token: "abc" } } });
  });

  it("bearer / empty token → Must be a non-empty string", () => {
    const r = parseAuthStrategyConfig({ kind: "bearer", config: { token: "" } });
    expect(r).toEqual({ ok: false, errors: ["config.token: Must be a non-empty string"] });
  });

  it("oidc / valid → scopes preserved as string[]", () => {
    const r = parseAuthStrategyConfig({
      kind: "oidc",
      config: { issuer: "https://idp.example.com", clientId: "flowatch", scopes: ["openid"] },
    });
    expect(r).toEqual({
      ok: true,
      value: {
        kind: "oidc",
        config: { issuer: "https://idp.example.com", clientId: "flowatch", scopes: ["openid"] },
      },
    });
  });

  it("oidc / invalid issuer URL → Must be a valid URL", () => {
    const r = parseAuthStrategyConfig({
      kind: "oidc",
      config: { issuer: "not-a-url", clientId: "c", scopes: ["openid"] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("config.issuer: Must be a valid URL");
  });

  it("oidc / empty clientId → Must be a non-empty string", () => {
    const r = parseAuthStrategyConfig({
      kind: "oidc",
      config: { issuer: "https://idp", clientId: "", scopes: ["openid"] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("config.clientId: Must be a non-empty string");
  });

  it("oidc / empty scopes → Must contain at least one scope", () => {
    const r = parseAuthStrategyConfig({
      kind: "oidc",
      config: { issuer: "https://idp", clientId: "c", scopes: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContain("config.scopes: Must contain at least one scope");
  });

  it("multiple errors returned together (not short-circuit)", () => {
    const r = parseAuthStrategyConfig({
      kind: "oidc",
      config: { issuer: "", clientId: "", scopes: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(3);
      expect(r.errors).toContain("config.issuer: Must be a non-empty string");
      expect(r.errors).toContain("config.clientId: Must be a non-empty string");
      expect(r.errors).toContain("config.scopes: Must contain at least one scope");
    }
  });

  it("formatErrors joins with newlines", () => {
    expect(formatErrors(["a", "b"])).toBe("a\nb");
    expect(formatErrors([])).toBe("");
  });
});
