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
   * scan scopes itself to the Flowatch chrome and EXCLUDES `.djs-container`
   * so out-of-tree canvas internals are not audited (Story 32.1 AC #8).
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
