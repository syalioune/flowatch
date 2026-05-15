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
 *   - "app:open-inspector"  — fire-and-forget: open the API Inspector drawer.
 *                             Dispatched by PageHead, the modeler toolbar, and
 *                             anywhere else a screen-internal control wants to
 *                             surface the live REST log. The listener lives in
 *                             <App /> (src/app.tsx).
 */

declare global {
  interface WindowEventMap {
    "app:open-inspector": CustomEvent<void>;
  }
}

export {};
