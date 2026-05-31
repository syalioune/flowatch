// SPDX-License-Identifier: Apache-2.0

/**
 * Cross-component invalidation events.
 *
 * The window-event names collected here are dispatched from one component and
 * listened on in another (typically `src/app.tsx`). Hoisting them to a single
 * module means a typo in either side breaks the build instead of silently
 * dropping the event at runtime.
 *
 * See CLAUDE.md "Event-driven API log" for the broader pattern (the in-memory
 * API_LOG dispatches `api:log` per call — that one stays inline at the dispatch
 * site because its consumer surface is narrow). This module collects only the
 * load-bearing cross-component event names.
 *
 * Hoist origin: Story 12.2 (Epic 11 retro A-2) — 7 dispatch sites at hoist
 * time:
 *   - src/routes/tasks/index.tsx (handleClaim / handleUnclaim / handleComplete)
 *   - src/components/TaskFormPanel.tsx (form submit success)
 *   - src/lib/delegate-task-modal.tsx (delegate submit success)
 *   - src/components/TaskDetail.tsx (resolve success)
 *   - src/lib/cancel-instance-modal.tsx (cancel success)
 *   - src/lib/start-instance-modal.tsx (start success)
 *   - src/routes/jobs/index.tsx (Story 12.2 handleExecute success — first
 *     new consumer added by the hoisting PR itself).
 *
 * Listener (sole): src/app.tsx's `refreshNavCounts` effect.
 */
export const NAV_INVALIDATE_COUNTS = "nav:invalidate-counts" as const;

/**
 * Cross-component invalidation event dispatched by the saved-connections
 * CRUD module (`src/lib/saved-connections.ts`) on every write — add / update
 * / delete / set-active.
 *
 * Listeners: the SettingsModal Manage-connections panel + the Topbar
 * `.connection-switch` chip popover. Both re-read `loadConnections()` on
 * receipt; no prop drilling.
 *
 * Hoist origin: Story 23.1 (FR-49).
 */
export const SAVED_CONNECTIONS_CHANGED = "saved-connections:changed" as const;
