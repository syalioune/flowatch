/**
 * Migration-window helpers for Epic 3 (TanStack Router rollout).
 *
 * Story 3.6 deletes this file: every screen will be addressable by route,
 * `<Sidebar>` will use `<Link>` for every nav item, and the legacy `view`
 * state + `app:set-view` event will be gone.
 */

export const VIEW_TO_PATH: Record<string, string> = {
  dashboard: "/",
  bpmn: "/bpmn",
  dmn: "/dmn",
  deployments: "/deployments",
  definitions: "/definitions",
  instances: "/instances",
  jobs: "/jobs",
  tasks: "/tasks",
  history: "/history",
  identity: "/identity",
  tenants: "/tenants",
};

export const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([v, p]) => [p, v]),
);

/** Views whose route file exists today. Story 3.5 completes the migration. */
export const ROUTED_VIEWS = new Set<string>([
  "dashboard",
  "bpmn",
  "dmn",
  "deployments",
  "definitions",
  "instances",
  "tasks",
  "jobs",
  "history",
  "identity",
  "tenants",
]);

/** Fire-and-forget request to open the API Inspector drawer. */
export function openInspector(): void {
  window.dispatchEvent(new CustomEvent<void>("app:open-inspector"));
}

/** Switch the legacy view-state to `view` (used when the target isn't routed yet). */
export function setLegacyView(view: string): void {
  window.dispatchEvent(new CustomEvent<string>("app:set-view", { detail: view }));
}
