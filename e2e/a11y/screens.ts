// SPDX-License-Identifier: Apache-2.0
/**
 * Shared screen registry for the e2e/a11y suite (Story 32.1, Task 2).
 *
 * BEFORE 32.1 this list was triplicated: keyboard.spec.ts owned a local
 * `SCREENS` const, aria.spec.ts owned its own subset lists, and the new
 * axe-scan.spec.ts would have been the 3rd copy. The canonical route
 * inventory MUST stay in sync across all three specs, so it is hoisted here.
 *
 * Scope note (CLAUDE.md "Never extract at N=3/N=4"): that project policy
 * governs APPLICATION patterns under `src/`. This is test-infra
 * deduplication of a single canonical list that MUST stay in sync — a
 * different concern — so the policy does not bar it. keyboard.spec.ts and
 * axe-scan.spec.ts import `SCREEN_LIST` directly (both walk the full route
 * inventory). aria.spec.ts imports `SCREENS` and derives its purpose-built
 * table/badge SUBSETS by key (it is a targeted-ARIA-assertion list with
 * fixtures, not a route walk), so it reuses the canonical path/label while
 * keeping its own stricter `ready` selectors.
 *
 * The inventory is derived from `src/routes/` (grep `createFileRoute`), NOT
 * the stale planning-era "11 screens" estimate — Epics 24/25/27 added
 * `/app-definitions`, `/batches`, `/events`. See the Story 32.1 Dev Notes
 * § Screen inventory.
 */

export interface ScreenEntry {
  path: string;
  label: string;
  /**
   * Selector that proves the screen finished its first render. May be a
   * comma-separated set of alternates (table OR empty-state OR error box) —
   * `waitForSelector` resolves on whichever appears first.
   */
  ready: string;
  /**
   * Modeler routes use keyboard.spec's relaxed AC-3 variant (focusable-tag
   * check only; the canvas mounts async and owns its own keyboard handling).
   */
  relaxed?: boolean;
  /**
   * Routes that embed a third-party canvas (`bpmn-js` / `dmn-js`). The axe
   * scan scopes itself to the Flowatch chrome and EXCLUDES the out-of-tree
   * canvas internals so they are not audited (Story 32.1 AC #8): the diagram
   * surface `.djs-container` (BPMN DRD + DMN DRD) AND the dmn-js decision-
   * table editor `.dmn-decision-table-container` (Story 32.2 — its FEEL-cell
   * `.content-editable` editors are dmn-js-owned DOM, not Flowatch chrome,
   * and produced dark-theme `color-contrast` findings the engine ships).
   */
  excludeCanvas?: boolean;
}

// List screens all render a `table.tbl`, an empty-state, or a `.empty`
// placeholder depending on engine data. The KPI screens (dashboard, tenants)
// render a `.kpi` / `.kpi-grid` grid instead.
const LIST_READY = "table.tbl, [data-testid='empty-state'], .empty";
const KPI_READY = ".kpi, .kpi-grid, table.tbl, [data-testid='empty-state'], .empty";

export const SCREENS = {
  dashboard: { path: "/", label: "Dashboard", ready: ".kpi" },
  deployments: { path: "/deployments", label: "Deployments", ready: LIST_READY },
  definitions: { path: "/definitions", label: "Process definitions", ready: LIST_READY },
  instances: { path: "/instances", label: "Process instances", ready: LIST_READY },
  tasks: { path: "/tasks", label: "Tasks", ready: LIST_READY },
  jobs: { path: "/jobs", label: "Jobs (executable tab)", ready: LIST_READY },
  history: { path: "/history", label: "History", ready: LIST_READY },
  identity: { path: "/identity", label: "Identity (users tab)", ready: LIST_READY },
  tenants: { path: "/tenants", label: "Tenants", ready: KPI_READY },
  decisions: { path: "/decisions", label: "Decisions", ready: "table.tbl, .empty, .tabs" },
  appDefinitions: {
    path: "/app-definitions",
    label: "App definitions",
    ready: LIST_READY,
  },
  batches: { path: "/batches", label: "Batches", ready: LIST_READY },
  events: { path: "/events", label: "Event subscriptions", ready: LIST_READY },
  bpmn: {
    path: "/bpmn",
    label: "BPMN modeler",
    ready: ".mod-toolbar",
    relaxed: true,
    excludeCanvas: true,
  },
  dmn: {
    path: "/dmn",
    label: "DMN modeler",
    ready: ".mod-toolbar",
    relaxed: true,
    excludeCanvas: true,
  },
} as const satisfies Record<string, ScreenEntry>;

export type ScreenKey = keyof typeof SCREENS;

export const SCREEN_LIST: ReadonlyArray<ScreenEntry> = Object.values(SCREENS);

/**
 * Detail-route registry (Story 32.2 review — D1 gate-scope expansion).
 *
 * The top-level `SCREENS` list only covers index routes. The 9 `$id`/`$key`
 * detail routes host their own input-bearing surfaces (action buttons, panel
 * forms) that a label/aria regression could slip into unscanned. Each detail
 * route is audited in TWO states:
 *   - **error state** — navigated with `bogusId` (an id that won't resolve), so
 *     the accessible ErrorBox / empty-state chrome is scanned. Deterministic,
 *     no seed data required.
 *   - **seeded state** — the populated detail page, navigated with a real id
 *     fetched live from the engine via `seed` (a Flowable REST page-list
 *     endpoint, proxied through Vite). The seeded cell runs ONLY for entities
 *     the axe suite deterministically seeds in `beforeAll` (a BPMN + a DMN
 *     deploy → deployment / process-definition / decision always present). The
 *     other detail routes carry `seed: null` and are covered by the
 *     error-state cell only — NO conditional `test.skip`, because a test that
 *     silently skips on missing data is noise (it either runs or it doesn't
 *     exist). Adding deterministic seeding for those entities (start an
 *     instance, create a batch/group) is the way to promote them to a seeded
 *     cell later.
 */
export interface DetailScreenEntry {
  key: string;
  label: string;
  /** Build the detail-route path from a real or bogus id/key. */
  toPath: (id: string) => string;
  /** Sentinel id that won't resolve — drives the error/empty-state scan. */
  bogusId: string;
  /**
   * Live-engine seed: a Flowable REST page-list endpoint (Vite-proxy path) and
   * the field to read off `data[0]`. Non-null ONLY for the entities the axe
   * suite deterministically seeds (deployment / definition / decision). `null`
   * = error-state cell only (no seeded cell is generated — no skip).
   */
  seed: { listPath: string; idField: string } | null;
  /** Ready selector — populated `.page`, an ErrorBox, or an empty placeholder. */
  ready: string;
  /** instances/$id embeds the Epic-26 bpmn-js marker canvas (out-of-tree). */
  excludeCanvas?: boolean;
}

const DETAIL_READY = ".page, [data-testid='error-box'], .empty, [data-testid='empty-state']";

export const DETAIL_SCREENS = {
  instance: {
    key: "instance",
    label: "Process instance detail",
    toPath: (id) => `/instances/${id}`,
    bogusId: "axe-nonexistent",
    seed: null,
    ready: DETAIL_READY,
    excludeCanvas: true,
  },
  task: {
    key: "task",
    label: "Task detail",
    toPath: (id) => `/tasks/${id}`,
    bogusId: "axe-nonexistent",
    seed: null,
    ready: DETAIL_READY,
  },
  deployment: {
    key: "deployment",
    label: "Deployment detail",
    toPath: (id) => `/deployments/${id}`,
    bogusId: "axe-nonexistent",
    seed: { listPath: "/flowable-rest/service/repository/deployments?size=1", idField: "id" },
    ready: DETAIL_READY,
  },
  definition: {
    key: "definition",
    label: "Process definition detail",
    toPath: (id) => `/definitions/${id}`,
    bogusId: "axe-nonexistent",
    seed: {
      listPath: "/flowable-rest/service/repository/process-definitions?size=1",
      idField: "id",
    },
    ready: DETAIL_READY,
  },
  decision: {
    key: "decision",
    label: "Decision detail",
    toPath: (key) => `/decisions/${key}`,
    bogusId: "axe-nonexistent",
    seed: {
      listPath: "/flowable-rest/dmn-api/dmn-repository/decision-tables?size=1",
      idField: "key",
    },
    ready: DETAIL_READY,
  },
  user: {
    key: "user",
    label: "User detail",
    toPath: (id) => `/identity/users/${id}`,
    bogusId: "axe-nonexistent",
    seed: null,
    ready: DETAIL_READY,
  },
  group: {
    key: "group",
    label: "Group detail",
    toPath: (id) => `/identity/groups/${id}`,
    bogusId: "axe-nonexistent",
    seed: null,
    ready: DETAIL_READY,
  },
  appDefinition: {
    key: "appDefinition",
    label: "App definition detail",
    toPath: (id) => `/app-definitions/${id}`,
    bogusId: "axe-nonexistent",
    seed: null,
    ready: DETAIL_READY,
  },
  batch: {
    key: "batch",
    label: "Batch detail",
    toPath: (id) => `/batches/${id}`,
    bogusId: "axe-nonexistent",
    seed: null,
    ready: DETAIL_READY,
  },
} as const satisfies Record<string, DetailScreenEntry>;

export type DetailScreenKey = keyof typeof DETAIL_SCREENS;

export const DETAIL_SCREEN_LIST: ReadonlyArray<DetailScreenEntry> = Object.values(DETAIL_SCREENS);
