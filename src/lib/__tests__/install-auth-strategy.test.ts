// SPDX-License-Identifier: Apache-2.0

/**
 * Unit suite for the Story 28.2 install dispatcher
 * (installStrategyForActiveConnection + DormantAuthStrategy).
 *
 * Drives the real saved-connections localStorage path (jsdom) so the dispatcher
 * reads getActiveConnection() and installs into the real api funnel.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "../../api";
import { type AuthStrategy, BasicAuthStrategy } from "../auth-strategy";
import type { AuthStrategyConfig } from "../auth-strategy-config";
import { DormantAuthStrategy, installStrategyForActiveConnection } from "../install-auth-strategy";
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

  it("installs a kind:'bearer' DormantAuthStrategy for a bearer connection", () => {
    seed({ kind: "bearer", config: { token: "tok-123" } });
    installStrategyForActiveConnection();
    const s = api.getAuthStrategy();
    expect(s.kind).toBe("bearer");
    expect(s).toBeInstanceOf(DormantAuthStrategy);
  });

  it("installs a kind:'oidc' DormantAuthStrategy for an oidc connection", () => {
    seed({
      kind: "oidc",
      config: { issuer: "https://idp.test", clientId: "cid", scopes: ["openid"] },
    });
    installStrategyForActiveConnection();
    const s = api.getAuthStrategy();
    expect(s.kind).toBe("oidc");
    expect(s).toBeInstanceOf(DormantAuthStrategy);
  });

  it("DormantAuthStrategy still produces a Basic header from api.config()", async () => {
    api.setConfig({ username: "dorm-u", password: "dorm-p" });
    const s: AuthStrategy = new DormantAuthStrategy("bearer");
    expect(await s.authorizationHeader()).toBe(`Basic ${btoa("dorm-u:dorm-p")}`);
    expect(s.onUnauthorized).toBeUndefined();
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
