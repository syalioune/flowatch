// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the AuthStrategy family (Story 28.1).
 *
 * Story 28.1 ships exactly one concrete — {@link BasicAuthStrategy}. Bearer
 * (28.3) + OIDC (28.4) extend this file with their own describe blocks.
 */

import { describe, expect, it, vi } from "vitest";
import { type AuthStrategy, BasicAuthStrategy } from "../auth-strategy";

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
