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
import { randomId } from "./random-id";

// Story 23.2: the permissive 23.1 typedef is dropped; `AuthStrategyConfig`
// now comes from `auth-strategy-config.ts` as a strict discriminated union.
// Re-exported here so existing `SavedConnection` consumers keep their import
// path stable.
export type { AuthStrategyConfig };

export interface SavedConnection {
  id: string;
  label: string;
  baseUrl: string;
  /**
   * Basic-exclusive credentials. Story 23.2 follow-up: omitted when
   * `authStrategyConfig.kind !== "basic"` so Bearer / OIDC entries don't
   * carry empty / stale username/password fields. The runtime call path
   * (api.setConfig) defaults missing values to "" via setActiveConnection.
   *
   * `undefined` is an accepted value for these slots so `updateConnection`
   * can carry tombstones in the patch object (kind=basic → kind=bearer
   * drops the fields from the entity).
   */
  username?: string | undefined;
  password?: string | undefined;
  tenantId: string;
  /** Story 23.2 reserves; 23.1 leaves typed-but-unread. */
  authStrategyConfig?: AuthStrategyConfig | undefined;
  // Story 34.1 — per-sub-app URI prefix overrides (FR-59). Blank/undefined →
  // the *Base() helper's standard flowable-rest:7.2.0 default. Single
  // leading-slash-normalized URI segments, NOT full URLs. `undefined` is an
  // accepted value so `updateConnection` can tombstone a cleared field.
  servicePath?: string | undefined;
  dmnPath?: string | undefined;
  cmmnPath?: string | undefined;
  appPath?: string | undefined;
}

export interface SavedConnectionsState {
  schemaVersion: 2; // Story 34.1: bumped from 1 (per-sub-app prefix overrides).
  activeId: string | null;
  connections: SavedConnection[];
}

/** Story 34.1: the four per-sub-app prefix slots, kept in one place. */
const PREFIX_FIELDS = ["servicePath", "dmnPath", "cmmnPath", "appPath"] as const;

/**
 * Normalize a per-sub-app URI prefix to a single leading-slash-prefixed,
 * trailing-slash-stripped segment. Returns `undefined` for null/undefined/
 * empty-after-trim (→ the *Base() helper's standard default applies) and for
 * any non-string (defensive — a corrupt persisted shape silent-drops to the
 * default rather than corrupting the derived sub-app URL).
 *
 * NOT a full URL, NOT multi-segment-with-query, NOT a regex — a single URI
 * segment. Hand-written (no Zod), mirroring the no-dep validator choice in
 * auth-strategy-config.ts (Story 23.2).
 */
export function normalizePrefix(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const noTrailing = trimmed.replace(/\/+$/, "");
  if (noTrailing === "") return undefined; // value was only slashes
  const segment = noTrailing.startsWith("/") ? noTrailing : `/${noTrailing}`;
  // Reject multi-segment paths (e.g. "/rest/service") — a servicePath with an
  // internal slash matches mid-URL in connectionRoot(), silently truncating
  // baseUrl to a garbage host prefix. Single segment only.
  if (segment.indexOf("/", 1) !== -1) return undefined;
  return segment;
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
  // CodeQL CWE-338: avoid Math.random() for identity-bearing values. The
  // `randomId` helper (src/lib/random-id.ts) pulls from
  // crypto.getRandomValues when available; final fallback is timestamp-
  // only, accepting a collision risk in environments with no Web Crypto.
  return `conn-${Date.now().toString(36)}-${randomId(32)}`;
};

const dispatch = (): void => {
  try {
    window.dispatchEvent(new CustomEvent(SAVED_CONNECTIONS_CHANGED));
  } catch {
    /* SSR / non-DOM context */
  }
};

// Story 34.1: accept both v1 (pre-prefix) and v2 payloads. A valid v1 payload
// is migrated in-place by loadConnections() (NOT re-seeded from legacy — that
// would orphan the operator's connections).
const isValidStateShape = (
  raw: unknown,
): raw is SavedConnectionsState & { schemaVersion: 1 | 2 } => {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as { schemaVersion?: unknown; connections?: unknown; activeId?: unknown };
  if (s.schemaVersion !== 1 && s.schemaVersion !== 2) return false;
  if (!Array.isArray(s.connections)) return false;
  if (s.activeId !== null && typeof s.activeId !== "string") return false;
  for (const c of s.connections) {
    if (!c || typeof c !== "object") return false;
    const conn = c as Partial<SavedConnection>;
    if (typeof conn.id !== "string" || typeof conn.label !== "string") return false;
    // Review patch: strict typecheck on cfg string fields so a partially-
    // corrupt entry cannot leak into `api.setConfig` and corrupt the
    // Authorization header. Story 23.2 follow-up: `username`/`password` are
    // optional (Basic-exclusive); accept missing OR string.
    if (typeof conn.baseUrl !== "string") return false;
    if (conn.username !== undefined && typeof conn.username !== "string") return false;
    if (conn.password !== undefined && typeof conn.password !== "string") return false;
    if (typeof conn.tenantId !== "string") return false;
    // Story 34.1: prefix fields are validated/narrowed at load (normalizePrefix
    // silent-drops corrupt shapes), so they don't gate shape validity here.
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
    schemaVersion: 2, // Story 34.1: seeds are born v2 (prefix fields undefined).
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
 *
 * Story 34.1: a `schemaVersion: 1` payload is migrated in-place to `2` by
 * bumping the version (the four prefix fields stay `undefined` → standard
 * defaults → ZERO behavior change) and re-persisting. The migration is
 * lossless (no connection or field is dropped; `authStrategyConfig` survives)
 * and idempotent (an already-v2 payload re-persists identically). Each present
 * prefix field is run through {@link normalizePrefix}; a corrupt (non-string)
 * shape silent-drops to `undefined` (→ standard default), mirroring the
 * authStrategyConfig narrowing pass — the operator re-fills from the Edit modal.
 */
export function loadConnections(): SavedConnectionsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return migrateLegacyConnection();
    const parsed = JSON.parse(raw);
    if (!isValidStateShape(parsed)) return migrateLegacyConnection();
    const needsMigration = parsed.schemaVersion !== 2;
    let prefixModified = false;
    for (const c of parsed.connections) {
      if (c.authStrategyConfig !== undefined) {
        const r = parseAuthStrategyConfig(c.authStrategyConfig);
        if (r.ok) c.authStrategyConfig = r.value;
        else delete c.authStrategyConfig;
      }
      // Story 34.1: narrow each present prefix field; silent-drop corrupt shapes.
      const conn = c as unknown as Record<string, unknown>;
      for (const field of PREFIX_FIELDS) {
        if (conn[field] === undefined) continue;
        const norm = normalizePrefix(conn[field]);
        if (norm === undefined) {
          delete conn[field];
          prefixModified = true;
        } else {
          // normalizePrefix may normalize the stored value (e.g. strip trailing
          // slash); treat a changed value as modified so it gets re-persisted.
          if (conn[field] !== norm) {
            conn[field] = norm;
            prefixModified = true;
          }
        }
      }
    }
    // Story 34.1: bump v1 → v2 and re-persist so the next read is a no-op.
    // Also re-persist when prefix normalization changed or deleted a corrupt
    // field from an already-v2 payload (needsMigration=false) so the fix
    // survives the next cold load rather than being re-applied silently every
    // time.
    parsed.schemaVersion = 2;
    if (needsMigration || prefixModified) saveConnections(parsed);
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
  // Tombstone semantics: callers that explicitly pass `undefined` for an
  // optional field signal "delete it" (e.g., switching kind=basic → bearer
  // drops `username`/`password` from the entity).
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
    if (patch[k] === undefined) delete (updated as unknown as Record<string, unknown>)[k];
  }
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
    // Missing username/password (Bearer/OIDC connections) defaults to "" —
    // the runtime call path is still Basic auth today; Story 28.x activates
    // the AuthStrategy interface that consumes `authStrategyConfig`.
    username: selected.username ?? "",
    password: selected.password ?? "",
    tenantId: selected.tenantId,
    // Story 34.1: propagate per-sub-app prefix overrides into the runtime cfg
    // so dmnBase()/appBase()/cmmnBase() immediately reflect the active
    // connection (no reload). `undefined` → the *Base() helper's default.
    servicePath: selected.servicePath,
    dmnPath: selected.dmnPath,
    cmmnPath: selected.cmmnPath,
    appPath: selected.appPath,
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
