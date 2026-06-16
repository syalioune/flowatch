// SPDX-License-Identifier: Apache-2.0

/**
 * Vitest unit suite for src/lib/saved-connections.ts (Story 23.1 — FR-49).
 *
 * Pattern P-009: we do NOT vi.mock("../../api"). We exercise the real
 * `api.setConfig` path so the integration with the legacy single-cfg
 * write-through is verified end-to-end.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import { SAVED_CONNECTIONS_CHANGED } from "../nav-events";
import {
  addConnection,
  deleteConnection,
  getActiveConnection,
  loadConnections,
  migrateLegacyConnection,
  normalizePrefix,
  STORAGE_KEY,
  saveConnections,
  setActiveConnection,
  updateConnection,
} from "../saved-connections";

const LEGACY_KEY = "flowatch.connection.v1";
const DEFAULTS = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
};

beforeEach(() => {
  api.setConfig(DEFAULTS);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("loadConnections — migration", () => {
  it("empty localStorage → seeds one Default entry from DEFAULT_CFG", () => {
    const state = loadConnections();
    expect(state.schemaVersion).toBe(2); // Story 34.1: seeds born v2
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]?.label).toBe("Default");
    expect(state.connections[0]?.baseUrl).toBe(DEFAULTS.baseUrl);
    expect(state.activeId).toBe(state.connections[0]?.id);
  });

  it("legacy flowatch.connection.v1 present + multi-key empty → seeds from legacy + preserves legacy", () => {
    const legacy = {
      baseUrl: "http://prod:8080/flowable-rest/service",
      username: "alice",
      password: "s3cret",
      tenantId: "acme",
    };
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));
    const state = loadConnections();
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]?.label).toBe("Default");
    expect(state.connections[0]?.baseUrl).toBe(legacy.baseUrl);
    expect(state.connections[0]?.username).toBe(legacy.username);
    expect(state.connections[0]?.tenantId).toBe("acme");
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it("corrupt JSON on the multi-key → migration fallback fires", () => {
    localStorage.setItem(STORAGE_KEY, "{bad json");
    expect(() => loadConnections()).not.toThrow();
    const state = loadConnections();
    expect(state.connections).toHaveLength(1);
  });

  it("missing schemaVersion → migration fallback fires", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ activeId: "x", connections: [] }));
    const state = loadConnections();
    expect(state.schemaVersion).toBe(2); // Story 34.1: seeds born v2
    expect(state.connections).toHaveLength(1);
  });

  it("valid persisted state → returned as-is, no migration", () => {
    const initial = loadConnections();
    const persisted = loadConnections();
    expect(persisted.activeId).toBe(initial.activeId);
    expect(persisted.connections[0]?.id).toBe(initial.connections[0]?.id);
  });

  it("migrateLegacyConnection persists the seeded state", () => {
    migrateLegacyConnection();
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});

describe("addConnection", () => {
  it("appends a new entry with a uuid id + dispatches event + returns the entity", () => {
    loadConnections();
    const listener = vi.fn();
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    const created = addConnection({
      label: "Staging",
      baseUrl: "http://staging/flowable-rest/service",
      username: "x",
      password: "y",
      tenantId: "",
    });
    window.removeEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    expect(created.id).toBeTruthy();
    expect(created.label).toBe("Staging");
    const state = loadConnections();
    expect(state.connections.find((c) => c.id === created.id)).toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("throws on label collision (case-sensitive)", () => {
    loadConnections();
    expect(() =>
      addConnection({
        label: "Default",
        baseUrl: "http://x",
        username: "",
        password: "",
        tenantId: "",
      }),
    ).toThrowError(/Label 'Default' is already in use/);
  });
});

describe("updateConnection", () => {
  it("merges patch + persists + dispatches + returns the updated entity", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    const listener = vi.fn();
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    const updated = updateConnection(id, { label: "Renamed", username: "bob" });
    window.removeEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    expect(updated.label).toBe("Renamed");
    expect(updated.username).toBe("bob");
    expect(loadConnections().connections[0]?.label).toBe("Renamed");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("throws on missing id", () => {
    loadConnections();
    expect(() => updateConnection("missing", { label: "x" })).toThrowError(/not found/);
  });

  it("throws on label collision with a different entry", () => {
    loadConnections();
    const second = addConnection({
      label: "Other",
      baseUrl: "http://x",
      username: "",
      password: "",
      tenantId: "",
    });
    expect(() => updateConnection(second.id, { label: "Default" })).toThrowError(
      /Label 'Default' is already in use/,
    );
  });

  it("same-entry no-op label is allowed", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    expect(() => updateConnection(id, { label: "Default" })).not.toThrow();
  });
});

describe("deleteConnection", () => {
  it("removes from list + persists + dispatches", () => {
    loadConnections();
    const added = addConnection({
      label: "Doomed",
      baseUrl: "http://x",
      username: "",
      password: "",
      tenantId: "",
    });
    const listener = vi.fn();
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    deleteConnection(added.id);
    window.removeEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    expect(loadConnections().connections.find((c) => c.id === added.id)).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("throws when deleting the active connection", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    expect(state.activeId).toBe(id);
    expect(() => deleteConnection(id)).toThrowError(
      /Cannot delete the active connection. Switch active first./,
    );
  });

  it("throws on missing id", () => {
    loadConnections();
    expect(() => deleteConnection("nope")).toThrowError(/not found/);
  });
});

describe("setActiveConnection", () => {
  it("updates activeId + calls api.setConfig with the entity's cfg + dispatches", () => {
    loadConnections();
    const added = addConnection({
      label: "Prod",
      baseUrl: "http://prod/flowable-rest/service",
      username: "admin",
      password: "p",
      tenantId: "acme",
    });
    const listener = vi.fn();
    window.addEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    setActiveConnection(added.id);
    window.removeEventListener(SAVED_CONNECTIONS_CHANGED, listener);
    expect(loadConnections().activeId).toBe(added.id);
    const cfg = api.config();
    expect(cfg.baseUrl).toBe("http://prod/flowable-rest/service");
    expect(cfg.username).toBe("admin");
    expect(cfg.tenantId).toBe("acme");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("throws on missing id", () => {
    loadConnections();
    expect(() => setActiveConnection("missing")).toThrowError(/not found/);
  });

  it("legacy flowatch.connection.v1 receives the write-through", () => {
    loadConnections();
    const added = addConnection({
      label: "Other",
      baseUrl: "http://other/flowable-rest/service",
      username: "u",
      password: "p",
      tenantId: "t",
    });
    setActiveConnection(added.id);
    const raw = localStorage.getItem(LEGACY_KEY);
    expect(raw).not.toBeNull();
    const legacy = JSON.parse(raw as string);
    expect(legacy.baseUrl).toBe("http://other/flowable-rest/service");
    expect(legacy.username).toBe("u");
  });
});

describe("getActiveConnection", () => {
  it("returns the active entry", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    const active = getActiveConnection();
    expect(active?.id).toBe(id);
  });

  it("returns null when activeId is null", () => {
    const state = loadConnections();
    state.activeId = null;
    saveConnections(state);
    expect(getActiveConnection()).toBeNull();
  });
});

describe("loadConnections — defensive narrowing of authStrategyConfig (Story 23.2)", () => {
  it("valid bearer config persists + parses back narrowed", () => {
    loadConnections();
    const added = addConnection({
      label: "BearerTest",
      baseUrl: "http://b/flowable-rest/service",
      username: "",
      password: "",
      tenantId: "",
      authStrategyConfig: { kind: "bearer", config: { token: "abc" } },
    });
    const state = loadConnections();
    const found = state.connections.find((c) => c.id === added.id);
    expect(found?.authStrategyConfig?.kind).toBe("bearer");
    if (found?.authStrategyConfig?.kind === "bearer") {
      expect(found.authStrategyConfig.config.token).toBe("abc");
    }
  });

  it("invalid persisted bearer config (empty token) silently drops to undefined", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    // Manually mutate localStorage to insert a corrupt config.
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    raw.connections[0].authStrategyConfig = { kind: "bearer", config: { token: "" } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    const reread = loadConnections();
    const found = reread.connections.find((c) => c.id === id);
    expect(found?.authStrategyConfig).toBeUndefined();
  });

  it("unknown kind silently drops to undefined", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    raw.connections[0].authStrategyConfig = { kind: "foo", config: {} };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    const reread = loadConnections();
    const found = reread.connections.find((c) => c.id === id);
    expect(found?.authStrategyConfig).toBeUndefined();
  });

  it("non-object authStrategyConfig silently drops", () => {
    const state = loadConnections();
    const id = state.connections[0]?.id as string;
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
    raw.connections[0].authStrategyConfig = "not-an-object";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
    const reread = loadConnections();
    const found = reread.connections.find((c) => c.id === id);
    expect(found?.authStrategyConfig).toBeUndefined();
  });
});

describe("saveConnections — quota error is silent", () => {
  it("setItem throw does not bubble", () => {
    const state = loadConnections();
    const setItem = localStorage.setItem.bind(localStorage);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveConnections(state)).not.toThrow();
    spy.mockRestore();
    // Restore should not be needed because we mocked the prototype method;
    // confirm subsequent writes work.
    setItem(STORAGE_KEY, JSON.stringify(state));
    expect(loadConnections().connections.length).toBeGreaterThan(0);
  });
});

// ── Story 34.1 — per-sub-app URI prefix overrides ─────────────────────────

describe("normalizePrefix", () => {
  it("returns undefined for null/undefined/empty/whitespace", () => {
    expect(normalizePrefix(undefined)).toBeUndefined();
    expect(normalizePrefix(null)).toBeUndefined();
    expect(normalizePrefix("")).toBeUndefined();
    expect(normalizePrefix("   ")).toBeUndefined();
  });

  it("returns undefined for non-string (corrupt shape)", () => {
    expect(normalizePrefix(42)).toBeUndefined();
    expect(normalizePrefix({ path: "/dmn" })).toBeUndefined();
    expect(normalizePrefix(["/dmn"])).toBeUndefined();
  });

  it("prepends a leading slash when absent", () => {
    expect(normalizePrefix("dmn-api")).toBe("/dmn-api");
  });

  it("preserves an existing leading slash", () => {
    expect(normalizePrefix("/dmn-api")).toBe("/dmn-api");
  });

  it("strips trailing slashes", () => {
    expect(normalizePrefix("/dmn-api/")).toBe("/dmn-api");
    expect(normalizePrefix("/dmn-api///")).toBe("/dmn-api");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePrefix("  /dmn-api  ")).toBe("/dmn-api");
  });

  it("returns undefined for a slash-only value", () => {
    expect(normalizePrefix("/")).toBeUndefined();
    expect(normalizePrefix("///")).toBeUndefined();
  });

  it("returns undefined for multi-segment paths (internal slash after leading)", () => {
    expect(normalizePrefix("/rest/service")).toBeUndefined();
    expect(normalizePrefix("rest/service")).toBeUndefined();
    expect(normalizePrefix("/dmn-api/v2")).toBeUndefined();
  });
});

describe("loadConnections — v1 → v2 migration (Story 34.1)", () => {
  const seedV1 = (overrides: Record<string, unknown> = {}) => {
    const state = {
      schemaVersion: 1,
      activeId: "c1",
      connections: [
        {
          id: "c1",
          label: "Prod",
          baseUrl: "http://prod:8080/flowable-rest/service",
          username: "alice",
          password: "s3cret",
          tenantId: "acme",
          ...overrides,
        },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  };

  it("bumps schemaVersion 1 → 2 and leaves prefix fields undefined (zero behavior change)", () => {
    seedV1();
    const state = loadConnections();
    expect(state.schemaVersion).toBe(2);
    const c = state.connections[0];
    expect(c?.servicePath).toBeUndefined();
    expect(c?.dmnPath).toBeUndefined();
    expect(c?.cmmnPath).toBeUndefined();
    expect(c?.appPath).toBeUndefined();
  });

  it("is lossless — no connection or field is dropped", () => {
    seedV1();
    const c = loadConnections().connections[0];
    expect(c?.label).toBe("Prod");
    expect(c?.baseUrl).toBe("http://prod:8080/flowable-rest/service");
    expect(c?.username).toBe("alice");
    expect(c?.password).toBe("s3cret");
    expect(c?.tenantId).toBe("acme");
  });

  it("re-persists the migrated payload (next read is already v2)", () => {
    seedV1();
    loadConnections();
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(persisted.schemaVersion).toBe(2);
  });

  it("is idempotent — loading an already-v2 payload is a no-op", () => {
    seedV1();
    const first = loadConnections();
    const second = loadConnections();
    expect(second).toEqual(first);
    expect(second.schemaVersion).toBe(2);
  });

  it("preserves a present authStrategyConfig across migration", () => {
    seedV1({
      authStrategyConfig: { kind: "bearer", config: { token: "tok123" } },
    });
    const c = loadConnections().connections[0];
    expect(c?.authStrategyConfig).toEqual({ kind: "bearer", config: { token: "tok123" } });
  });

  it("normalizes a present prefix field on load", () => {
    seedV1({ dmnPath: "custom-dmn/" });
    const c = loadConnections().connections[0];
    expect(c?.dmnPath).toBe("/custom-dmn");
  });

  it("silent-drops a corrupt (non-string) prefix shape to undefined", () => {
    seedV1({ dmnPath: 42, appPath: { foo: 1 } });
    const c = loadConnections().connections[0];
    expect(c?.dmnPath).toBeUndefined();
    expect(c?.appPath).toBeUndefined();
  });
});

describe("addConnection / updateConnection — prefix fields (Story 34.1)", () => {
  it("addConnection persists provided prefix overrides", () => {
    const created = addConnection({
      label: "Custom",
      baseUrl: "http://x:8080/flowable-rest/service",
      tenantId: "",
      dmnPath: "/custom-dmn",
    });
    const reread = loadConnections().connections.find((c) => c.id === created.id);
    expect(reread?.dmnPath).toBe("/custom-dmn");
  });

  it("updateConnection tombstones a cleared prefix (undefined deletes the key)", () => {
    const created = addConnection({
      label: "Custom",
      baseUrl: "http://x:8080/flowable-rest/service",
      tenantId: "",
      dmnPath: "/custom-dmn",
    });
    updateConnection(created.id, { dmnPath: undefined });
    const reread = loadConnections().connections.find((c) => c.id === created.id);
    expect(reread?.dmnPath).toBeUndefined();
    expect(Object.hasOwn(reread ?? {}, "dmnPath")).toBe(false);
  });
});

describe("setActiveConnection — propagates prefixes into cfg (Story 34.1)", () => {
  it("active connection's dmnPath lands in api.config()", () => {
    const created = addConnection({
      label: "Custom",
      baseUrl: "http://x:8080/flowable-rest/service",
      tenantId: "",
      dmnPath: "/custom-dmn",
    });
    setActiveConnection(created.id);
    expect(api.config().dmnPath).toBe("/custom-dmn");
  });

  it("switching to a connection without overrides clears the prior cfg prefix", () => {
    const custom = addConnection({
      label: "Custom",
      baseUrl: "http://x:8080/flowable-rest/service",
      tenantId: "",
      dmnPath: "/custom-dmn",
    });
    const plain = addConnection({
      label: "Plain",
      baseUrl: "http://y:8080/flowable-rest/service",
      tenantId: "",
    });
    setActiveConnection(custom.id);
    expect(api.config().dmnPath).toBe("/custom-dmn");
    setActiveConnection(plain.id);
    expect(api.config().dmnPath).toBeUndefined();
  });
});
