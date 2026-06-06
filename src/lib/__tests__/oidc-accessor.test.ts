// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the Story 28.4 OIDC accessor singleton + provider-config
 * resolver (src/lib/oidc-accessor.ts). Plain TS — no react-oidc-context import.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthStrategyConfig } from "../auth-strategy-config";
import {
  getOidcTokenAccessor,
  type OidcTokenAccessor,
  resolveOidcProviderConfig,
  setOidcTokenAccessor,
} from "../oidc-accessor";
import { type SavedConnectionsState, STORAGE_KEY } from "../saved-connections";

const seed = (asc: AuthStrategyConfig | undefined) => {
  const state: SavedConnectionsState = {
    schemaVersion: 1,
    activeId: "c1",
    connections: [
      {
        id: "c1",
        label: "Active",
        baseUrl: "http://localhost:8080/flowable-rest/service",
        tenantId: "",
        ...(asc ? { authStrategyConfig: asc } : {}),
      },
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  setOidcTokenAccessor(null);
});

describe("OIDC token accessor singleton", () => {
  it("get returns null until set", () => {
    expect(getOidcTokenAccessor()).toBeNull();
  });

  it("set then get round-trips the accessor; clearing sets null", () => {
    const accessor: OidcTokenAccessor = {
      getToken: async () => "t",
      signIn: () => {},
      signOut: () => {},
      isAuthenticated: true,
      username: "mira",
    };
    setOidcTokenAccessor(accessor);
    expect(getOidcTokenAccessor()).toBe(accessor);
    setOidcTokenAccessor(null);
    expect(getOidcTokenAccessor()).toBeNull();
  });
});

describe("resolveOidcProviderConfig", () => {
  it("returns null when the active connection is not OIDC", () => {
    seed({ kind: "basic", config: { username: "u", password: "p" } });
    expect(resolveOidcProviderConfig()).toBeNull();
    seed({ kind: "bearer", config: { token: "t" } });
    expect(resolveOidcProviderConfig()).toBeNull();
  });

  it("maps an OIDC connection to AuthProvider props (scopes joined, response_type code)", () => {
    seed({
      kind: "oidc",
      config: { issuer: "https://idp.test", clientId: "flowatch", scopes: ["openid", "profile"] },
    });
    const cfg = resolveOidcProviderConfig();
    expect(cfg).toEqual({
      authority: "https://idp.test",
      client_id: "flowatch",
      scope: "openid profile",
      redirect_uri: window.location.origin,
      response_type: "code",
    });
  });

  it("does NOT include any userStore / web-storage key (NFR-11 in-memory tokens)", () => {
    seed({
      kind: "oidc",
      config: { issuer: "https://idp.test", clientId: "flowatch", scopes: ["openid"] },
    });
    const cfg = resolveOidcProviderConfig();
    expect(cfg).not.toBeNull();
    expect(Object.keys(cfg as object)).not.toContain("userStore");
    expect(JSON.stringify(cfg)).not.toMatch(/localStorage|sessionStorage|WebStorage/);
  });
});
