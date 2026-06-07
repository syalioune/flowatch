// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the AuthStrategy family (Story 28.1).
 *
 * Story 28.1 ships exactly one concrete — {@link BasicAuthStrategy}. Bearer
 * (28.3) + OIDC (28.4) extend this file with their own describe blocks.
 */

import { describe, expect, it, vi } from "vitest";
import {
  type AuthStrategy,
  BasicAuthStrategy,
  BearerAuthStrategy,
  type OidcAccessorLike,
  OidcAuthStrategy,
} from "../auth-strategy";

describe("BasicAuthStrategy", () => {
  it("kind is 'basic'", () => {
    const s = new BasicAuthStrategy(() => ({ username: "u", password: "p" }));
    expect(s.kind).toBe("basic");
  });

  it("authorizationHeader() returns Basic <base64> of username:password", async () => {
    const s = new BasicAuthStrategy(() => ({ username: "u", password: "p" }));
    expect(await s.authorizationHeader()).toBe(`Basic ${btoa("u:p")}`);
  });

  it("reads the creds getter on EACH call (no snapshot)", async () => {
    const backing = { username: "u1", password: "p1" };
    const s = new BasicAuthStrategy(() => backing);
    expect(await s.authorizationHeader()).toBe(`Basic ${btoa("u1:p1")}`);
    backing.username = "u2";
    backing.password = "p2";
    // Second call reflects the mutated backing object — proves it is NOT a
    // snapshot taken at construction time.
    expect(await s.authorizationHeader()).toBe(`Basic ${btoa("u2:p2")}`);
  });

  it("invokes the creds getter once per authorizationHeader() call", async () => {
    const getter = vi.fn(() => ({ username: "u", password: "p" }));
    const s = new BasicAuthStrategy(getter);
    await s.authorizationHeader();
    await s.authorizationHeader();
    expect(getter).toHaveBeenCalledTimes(2);
  });

  it("leaves onUnauthorized undefined (Basic has no refresh recovery)", () => {
    const s: AuthStrategy = new BasicAuthStrategy(() => ({ username: "u", password: "p" }));
    expect(s.onUnauthorized).toBeUndefined();
  });

  it("satisfies the AuthStrategy interface (structural)", () => {
    const s: AuthStrategy = new BasicAuthStrategy(() => ({ username: "u", password: "p" }));
    expect(typeof s.authorizationHeader).toBe("function");
    expect(s.kind).toBe("basic");
  });

  it("handles empty credentials (encodes ':' )", async () => {
    const s = new BasicAuthStrategy(() => ({ username: "", password: "" }));
    expect(await s.authorizationHeader()).toBe(`Basic ${btoa(":")}`);
  });
});

describe("BearerAuthStrategy (Story 28.3)", () => {
  const noop = () => {};

  it("kind is 'bearer'", () => {
    const s = new BearerAuthStrategy(() => "t", noop);
    expect(s.kind).toBe("bearer");
  });

  it("authorizationHeader() returns 'Bearer <token>' for a non-empty token", async () => {
    const s = new BearerAuthStrategy(() => "tok-123", noop);
    expect(await s.authorizationHeader()).toBe("Bearer tok-123");
  });

  it("trims the token before producing the header", async () => {
    const s = new BearerAuthStrategy(() => "  tok-123  ", noop);
    expect(await s.authorizationHeader()).toBe("Bearer tok-123");
  });

  it("returns null for an empty / whitespace-only token", async () => {
    expect(await new BearerAuthStrategy(() => "", noop).authorizationHeader()).toBeNull();
    expect(await new BearerAuthStrategy(() => "   ", noop).authorizationHeader()).toBeNull();
  });

  it("reads the token getter LIVE each call (re-paste without re-install)", async () => {
    let token = "tok-1";
    const s = new BearerAuthStrategy(() => token, noop);
    expect(await s.authorizationHeader()).toBe("Bearer tok-1");
    token = "tok-2";
    expect(await s.authorizationHeader()).toBe("Bearer tok-2");
  });

  it("onUnauthorized() calls the injected onAuthFailure callback once", async () => {
    const onAuthFailure = vi.fn();
    const s = new BearerAuthStrategy(() => "t", onAuthFailure);
    await s.onUnauthorized();
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});

describe("OidcAuthStrategy (Story 28.4)", () => {
  const accessor = (over: Partial<OidcAccessorLike> = {}): OidcAccessorLike => ({
    getToken: async () => "oidc-access-token",
    renewSilent: () => {},
    ...over,
  });

  it("kind is 'oidc'", () => {
    const s = new OidcAuthStrategy(() => accessor());
    expect(s.kind).toBe("oidc");
  });

  it("authorizationHeader() returns Bearer <access-token> via the accessor", async () => {
    const s = new OidcAuthStrategy(() => accessor());
    expect(await s.authorizationHeader()).toBe("Bearer oidc-access-token");
  });

  it("awaits the accessor's getToken (async seam payoff — silent renew on demand)", async () => {
    const getToken = vi.fn(async () => "renewed-token");
    const s = new OidcAuthStrategy(() => accessor({ getToken }));
    expect(await s.authorizationHeader()).toBe("Bearer renewed-token");
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("returns null when the accessor is absent (provider not mounted)", async () => {
    const s = new OidcAuthStrategy(() => null);
    expect(await s.authorizationHeader()).toBeNull();
  });

  it("returns null when getToken yields null (not signed in / renew failed)", async () => {
    const s = new OidcAuthStrategy(() => accessor({ getToken: async () => null }));
    expect(await s.authorizationHeader()).toBeNull();
  });

  it("onUnauthorized() calls the accessor's renewSilent() (NOT an interactive redirect)", async () => {
    const renewSilent = vi.fn();
    const s = new OidcAuthStrategy(() => accessor({ renewSilent }));
    await s.onUnauthorized();
    expect(renewSilent).toHaveBeenCalledTimes(1);
  });

  it("onUnauthorized() debounces — a 401 storm fires at most one renew per 10s", async () => {
    const renewSilent = vi.fn();
    const s = new OidcAuthStrategy(() => accessor({ renewSilent }));
    await s.onUnauthorized();
    await s.onUnauthorized();
    await s.onUnauthorized();
    expect(renewSilent).toHaveBeenCalledTimes(1);
  });

  it("onUnauthorized() is a no-op when the accessor is absent", async () => {
    const s = new OidcAuthStrategy(() => null);
    await expect(s.onUnauthorized()).resolves.toBeUndefined();
  });
});
