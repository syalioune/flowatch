// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the Story 28.2 install dispatcher
 * (installStrategyForActiveConnection + DormantAuthStrategy).
 *
 * Drives the real saved-connections localStorage path (jsdom) so the dispatcher
 * reads getActiveConnection() and installs into the real api funnel.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { BasicAuthStrategy, BearerAuthStrategy, OidcAuthStrategy } from "../auth-strategy";
import type { AuthStrategyConfig } from "../auth-strategy-config";
import { installStrategyForActiveConnection } from "../install-auth-strategy";
import { OPEN_SETTINGS_AUTH } from "../nav-events";
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
        username: "u",
        password: "p",
        tenantId: "",
        ...(asc ? { authStrategyConfig: asc } : {}),
      },
    ],
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  // Reset to a clean default strategy so leakage can't poison other suites.
  api.setAuthStrategy(
    new BasicAuthStrategy(() => {
      const c = api.config();
      return { username: c.username, password: c.password };
    }),
  );
});

describe("installStrategyForActiveConnection", () => {
  it("installs BasicAuthStrategy for a basic-kind connection", () => {
    seed({ kind: "basic", config: { username: "u", password: "p" } });
    installStrategyForActiveConnection();
    expect(api.getAuthStrategy().kind).toBe("basic");
    expect(api.getAuthStrategy()).toBeInstanceOf(BasicAuthStrategy);
  });

  it("installs BasicAuthStrategy when the connection has no authStrategyConfig", () => {
    seed(undefined);
    installStrategyForActiveConnection();
    expect(api.getAuthStrategy().kind).toBe("basic");
  });

  it("installs a live BearerAuthStrategy for a bearer connection (Story 28.3)", async () => {
    seed({ kind: "bearer", config: { token: "tok-123" } });
    installStrategyForActiveConnection();
    const s = api.getAuthStrategy();
    expect(s.kind).toBe("bearer");
    expect(s).toBeInstanceOf(BearerAuthStrategy);
    // The installed strategy reads the persisted token live → Bearer header.
    expect(await s.authorizationHeader()).toBe("Bearer tok-123");
  });

  it("Bearer onUnauthorized dispatches OPEN_SETTINGS_AUTH (Story 28.3)", async () => {
    seed({ kind: "bearer", config: { token: "tok-123" } });
    installStrategyForActiveConnection();
    const spy = vi.fn();
    window.addEventListener(OPEN_SETTINGS_AUTH, spy);
    await api.getAuthStrategy().onUnauthorized?.();
    window.removeEventListener(OPEN_SETTINGS_AUTH, spy);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("installs a kind:'oidc' DormantAuthStrategy for an oidc connection", () => {
    seed({
      kind: "oidc",
      config: { issuer: "https://idp.test", clientId: "cid", scopes: ["openid"] },
    });
    installStrategyForActiveConnection();
    const s = api.getAuthStrategy();
    expect(s.kind).toBe("oidc");
    expect(s).toBeInstanceOf(OidcAuthStrategy);
  });

  it("OIDC strategy returns null header when the bridge accessor is absent", async () => {
    seed({
      kind: "oidc",
      config: { issuer: "https://idp.test", clientId: "cid", scopes: ["openid"] },
    });
    installStrategyForActiveConnection();
    // No <AuthProvider> mounted in jsdom → getOidcTokenAccessor() is null →
    // no header (engine 401 → onUnauthorized re-initiates the flow).
    expect(await api.getAuthStrategy().authorizationHeader()).toBeNull();
  });

  it("re-running the dispatcher after a kind change swaps the installed strategy", () => {
    seed({ kind: "basic", config: { username: "u", password: "p" } });
    installStrategyForActiveConnection();
    expect(api.getAuthStrategy().kind).toBe("basic");
    seed({ kind: "bearer", config: { token: "t" } });
    installStrategyForActiveConnection();
    expect(api.getAuthStrategy().kind).toBe("bearer");
  });
});
