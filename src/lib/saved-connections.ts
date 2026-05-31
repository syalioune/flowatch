// SPDX-License-Identifier: Apache-2.0

/**
 * Saved-connections persistence module (Story 23.1) — FR-49 client-side half.
 *
 * Pure-localStorage CRUD over the NEW {@link SavedConnection} entity. Holds
 * the project's first non-engine-backed entity with full CRUD UI (Tweaks
 * panel is key/value tweaks, not entities). Persists under the
 * `flowatch.connections.v1` key with a {schemaVersion, activeId, connections}
 * envelope.
 *
 * Migration on first read seeds from the legacy `flowatch.connection.v1`
 * single-cfg key (see [src/api.ts loadCfg/saveCfg](../api.ts)); the legacy
 * key is intentionally NOT deleted — `api.setConfig` keeps writing through
 * to it so a rollback to < v0.0.4 finds the last-active cfg intact.
 *
 * `authStrategyConfig?` is RESERVED for Story 23.2 — typed but unread here.
 * Story 23.2 narrows the union per `kind`; no schemaVersion bump.
 *
 * Cross-component invalidation: every write path dispatches the
 * {@link SAVED_CONNECTIONS_CHANGED} window event. Listeners (Topbar picker,
 * Settings Manage panel) re-read `loadConnections()` on receipt.
 *
 * NFR-11: Basic credentials persist in localStorage with the same posture as
 * the legacy single-cfg storage — no regression, no new attack surface. OIDC
 * tokens MUST NOT be persisted (Story 28.4 in-memory store).
 */

import { api } from "../api";
import { type AuthStrategyConfig, parseAuthStrategyConfig } from "./auth-strategy-config";
import { SAVED_CONNECTIONS_CHANGED } from "./nav-events";

// Story 23.2: the permissive 23.1 typedef is dropped; `AuthStrategyConfig`
// now comes from `auth-strategy-config.ts` as a strict discriminated union.
// Re-exported here so existing `SavedConnection` consumers keep their import
// path stable.
export type { AuthStrategyConfig };

export interface SavedConnection {
  id: string;
  label: string;
  baseUrl: string;
  username: string;
  password: string;
  tenantId: string;
  /** Story 23.2 reserves; 23.1 leaves typed-but-unread. */
  authStrategyConfig?: AuthStrategyConfig | undefined;
}

export interface SavedConnectionsState {
  schemaVersion: 1;
  activeId: string | null;
  connections: SavedConnection[];
}

export const STORAGE_KEY = "flowatch.connections.v1";
const LEGACY_STORAGE_KEY = "flowatch.connection.v1";

const DEFAULT_CFG = {
  baseUrl: "http://localhost:8080/flowable-rest/service",
  username: "rest-admin",
  password: "test",
  tenantId: "",
} as const;

const newId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const dispatch = (): void => {
  try {
    window.dispatchEvent(new CustomEvent(SAVED_CONNECTIONS_CHANGED));
  } catch {
    /* SSR / non-DOM context */
  }
};

const isValidStateShape = (raw: unknown): raw is SavedConnectionsState => {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as Partial<SavedConnectionsState>;
  if (s.schemaVersion !== 1) return false;
  if (!Array.isArray(s.connections)) return false;
  if (s.activeId !== null && typeof s.activeId !== "string") return false;
  for (const c of s.connections) {
    if (!c || typeof c !== "object") return false;
    const conn = c as Partial<SavedConnection>;
    if (typeof conn.id !== "string" || typeof conn.label !== "string") return false;
    // Review patch: strict typecheck on cfg string fields so a partially-
    // corrupt entry (missing `password`, non-string `baseUrl`) cannot leak
    // into `api.setConfig` and corrupt the Authorization header.
    if (typeof conn.baseUrl !== "string") return false;
    if (typeof conn.username !== "string") return false;
    if (typeof conn.password !== "string") return false;
    if (typeof conn.tenantId !== "string") return false;
  }
  return true;
};

/**
 * Read the legacy single-cfg `flowatch.connection.v1` key and seed a new
 * {@link SavedConnectionsState}. Called as fallback when the multi-connection
 * key is missing or malformed. Falls back to {@link DEFAULT_CFG} when the
 * legacy key is also missing/corrupt.
 *
 * Persists the seeded state to localStorage and does NOT delete the legacy
 * key (rollback safety net).
 *
 * Exported for tests; production code calls `loadConnections()`.
 */
export function migrateLegacyConnection(): SavedConnectionsState {
  let legacy = { ...DEFAULT_CFG };
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        legacy = { ...DEFAULT_CFG, ...parsed };
      }
    }
  } catch {
    /* corrupt legacy → defaults */
  }
  const id = newId();
  const state: SavedConnectionsState = {
    schemaVersion: 1,
    activeId: id,
    connections: [
      {
        id,
        label: "Default",
        baseUrl: legacy.baseUrl,
        username: legacy.username,
        password: legacy.password,
        tenantId: legacy.tenantId,
      },
    ],
  };
  saveConnections(state);
  return state;
}

/**
 * Read the persisted state. Defensive — corrupt JSON, missing schemaVersion,
 * or a non-array `connections` triggers {@link migrateLegacyConnection}.
 *
 * Story 23.2: each connection's `authStrategyConfig` (if present) is run
 * through {@link parseAuthStrategyConfig}; corrupt shapes silent-drop to
 * `undefined`. The operator's recovery is the Edit modal (where kind
 * defaults to `"basic"` when the slot is empty). The connection itself
 * survives — only the bad config is dropped.
 */
export function loadConnections(): SavedConnectionsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyConnection();
    const parsed = JSON.parse(raw);
    if (!isValidStateShape(parsed)) return migrateLegacyConnection();
    for (const c of parsed.connections) {
      if (c.authStrategyConfig !== undefined) {
        const r = parseAuthStrategyConfig(c.authStrategyConfig);
        if (r.ok) c.authStrategyConfig = r.value;
        // Review patch: `delete` rather than assigning `undefined` so the slot
        // doesn't become an enumerable own-property carrying a `undefined`
        // value that JSON.stringify would still skip but Object.keys would
        // surface.
        else delete c.authStrategyConfig;
      }
    }
    return parsed;
  } catch {
    return migrateLegacyConnection();
  }
}

/**
 * Persist the state. Silent-fail on quota/unavailable per the existing
 * `saveCfg` shape at [src/api.ts:116-122](../api.ts).
 */
export function saveConnections(state: SavedConnectionsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage may be unavailable (private mode, quota) */
  }
}

const findIndexOrThrow = (state: SavedConnectionsState, id: string): number => {
  const idx = state.connections.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Connection ${id} not found`);
  return idx;
};

/**
 * Append a new connection. Throws on label collision (case-sensitive). The
 * new entity gets a fresh uuid. Dispatches {@link SAVED_CONNECTIONS_CHANGED}.
 */
export function addConnection(input: Omit<SavedConnection, "id">): SavedConnection {
  const state = loadConnections();
  if (state.connections.some((c) => c.label === input.label)) {
    throw new Error(`Label '${input.label}' is already in use`);
  }
  const created: SavedConnection = { ...input, id: newId() };
  state.connections.push(created);
  saveConnections(state);
  dispatch();
  return created;
}

/**
 * Merge a partial patch over an existing entity. Throws on missing id or on
 * label collision with a DIFFERENT entry (same-entry no-op label is allowed).
 * Dispatches {@link SAVED_CONNECTIONS_CHANGED}.
 */
export function updateConnection(
  id: string,
  patch: Partial<Omit<SavedConnection, "id">>,
): SavedConnection {
  const state = loadConnections();
  const idx = findIndexOrThrow(state, id);
  const current = state.connections[idx];
  if (!current) throw new Error(`Connection ${id} not found`);
  if (patch.label !== undefined && patch.label !== current.label) {
    if (state.connections.some((c) => c.id !== id && c.label === patch.label)) {
      throw new Error(`Label '${patch.label}' is already in use`);
    }
  }
  const updated: SavedConnection = { ...current, ...patch };
  state.connections[idx] = updated;
  saveConnections(state);
  dispatch();
  return updated;
}

/**
 * Remove a connection. Throws on missing id or on attempt to delete the
 * active connection (operator's recovery is "switch active first"; an
 * auto-fail-over would be more magic than the project's polish floor).
 * Dispatches {@link SAVED_CONNECTIONS_CHANGED}.
 */
export function deleteConnection(id: string): void {
  const state = loadConnections();
  findIndexOrThrow(state, id);
  if (state.activeId === id) {
    throw new Error("Cannot delete the active connection. Switch active first.");
  }
  state.connections = state.connections.filter((c) => c.id !== id);
  saveConnections(state);
  dispatch();
}

/**
 * Set the active connection AND funnel the cfg through `api.setConfig` —
 * which writes through to the legacy `flowatch.connection.v1` key (rollback
 * safety) and fires the existing `conn:config-changed` event so the
 * App-level probe re-fires. Throws on missing id. Dispatches
 * {@link SAVED_CONNECTIONS_CHANGED}.
 */
export function setActiveConnection(id: string): SavedConnection {
  const state = loadConnections();
  const idx = findIndexOrThrow(state, id);
  const selected = state.connections[idx];
  if (!selected) throw new Error(`Connection ${id} not found`);
  state.activeId = id;
  saveConnections(state);
  api.setConfig({
    baseUrl: selected.baseUrl,
    username: selected.username,
    password: selected.password,
    tenantId: selected.tenantId,
  });
  dispatch();
  return selected;
}

/** Returns the active connection entry or null when activeId is null/stale. */
export function getActiveConnection(): SavedConnection | null {
  const state = loadConnections();
  if (state.activeId === null) return null;
  return state.connections.find((c) => c.id === state.activeId) ?? null;
}
