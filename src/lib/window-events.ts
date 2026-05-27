// SPDX-License-Identifier: Apache-2.0

/**
 * Ambient declarations for the project's window-scoped CustomEvent registry.
 *
 * Existing events (declared elsewhere):
 *   - "api:log"     (src/components.tsx)
 *   - "app:toast"   (src/components.tsx)
 *   - "tweakchange" (src/tweaks-panel.tsx)
 *
 * Events declared here:
 *   - "app:open-inspector"   — fire-and-forget: open the API Inspector drawer.
 *                              Dispatched by PageHead, the modeler toolbar,
 *                              ErrorBox (Story 8.2 — passes detail.focusEntryId
 *                              so the drawer can scroll to the offending call),
 *                              and anywhere else a screen-internal control
 *                              wants to surface the live REST log. The listener
 *                              lives in <App /> (src/app.tsx).
 *   - "conn:config-changed"  — fire-and-forget: signal that the Flowable
 *                              connection config (baseUrl / credentials /
 *                              tenant) changed and the engine probe should
 *                              re-run. Dispatched by api.setConfig() in
 *                              src/api.ts; listened by <App /> (src/app.tsx)
 *                              to re-trigger the probe without a full reload.
 */

declare global {
  interface WindowEventMap {
    "app:open-inspector": CustomEvent<{ focusEntryId?: string } | undefined>;
    "conn:config-changed": CustomEvent<void>;
  }
}

export {};
