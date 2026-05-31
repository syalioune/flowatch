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
    expect(state.schemaVersion).toBe(1);
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
    expect(state.schemaVersion).toBe(1);
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
