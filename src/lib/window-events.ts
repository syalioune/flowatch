/**
 * Ambient declarations for the project's window-scoped CustomEvent registry.
 *
 * Existing events (declared elsewhere):
 *   - "api:log"       (src/components.tsx)
 *   - "app:toast"     (src/components.tsx)
 *   - "tweakchange"   (src/tweaks-panel.tsx)
 *
 * Events declared here (Story 3.2 onwards):
 *   - "app:open-inspector"  — fire-and-forget: open the API Inspector drawer.
 *   - "app:set-view"        — fall-back nav for screens not yet routed.
 *                             Deleted by Story 3.6.
 */

declare global {
  interface WindowEventMap {
    "app:open-inspector": CustomEvent<void>;
    "app:set-view": CustomEvent<string>;
  }
}

export {};
