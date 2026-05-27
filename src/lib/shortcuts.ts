// SPDX-License-Identifier: Apache-2.0

/**
 * Keyboard shortcuts registry — UX §11 / Story 18.4.
 *
 * Single source of truth for every global keyboard shortcut Flowatch
 * supports. Both the cheatsheet modal AND the keydown listeners in
 * src/app.tsx read from this registry:
 *
 *   - The cheatsheet (src/lib/keyboard-cheatsheet-modal.tsx) renders the
 *     entries grouped by `category`.
 *   - The `?` listener opens the cheatsheet.
 *   - The `g`-prefix chord listener derives its chord-to-route mapping
 *     from the `navigation` category's `target` field.
 *
 * Per CLAUDE.md "no parallel source of truth" — adding a new nav entry
 * here registers the chord without touching app.tsx.
 *
 * Pattern P-008 application: src/__tests__/shortcuts-exhaustiveness.test.ts
 * parses this registry via Object.entries and asserts per-entry invariants
 * (keys non-empty, label ≤ 80 chars, category valid, no collisions). Fourth
 * Pattern P-008 consumer after wcag-contrast / empty-states-exhaustiveness /
 * sr-only-class (Story 17.3 / 17.5 / 18.2). Per CLAUDE.md "Never extract at
 * N=4", the inline-parse-and-iterate shape is preserved — no shared helper.
 *
 * The `satisfies Record<ShortcutKey, ShortcutEntry>` clause is the tsc-time
 * exhaustiveness guarantee; the Vitest test is defense-in-depth at the
 * literal level (e.g. an empty `keys: []` would tsc-check fine but the
 * test catches it).
 *
 * Closes Epic 17 retro AI-5.
 */

export type ShortcutCategory = "navigation" | "tweaks" | "modals";

export type ShortcutKey =
  | "cheatsheet"
  | "close"
  | "tweaks"
  | "nav-dashboard"
  | "nav-deployments"
  | "nav-definitions"
  | "nav-instances"
  | "nav-tasks"
  | "nav-jobs"
  | "nav-history"
  | "nav-identity"
  | "nav-tenants"
  | "nav-decisions"
  | "nav-bpmn"
  | "nav-dmn";

export interface ShortcutEntry {
  /**
   * Keys to render in the cheatsheet. For chords (Ctrl+Shift+T) the array
   * is `["Ctrl", "Shift", "T"]` — joined with `+` at render time. For
   * sequences (g, then d) the array is `["g", "d"]` — joined with ` `
   * (thin space) at render time.
   */
  keys: readonly string[];
  /** Human-readable description rendered in the cheatsheet. */
  label: string;
  category: ShortcutCategory;
  scope: "global";
  /**
   * Optional route target for `navigation`-category entries. The chord
   * listener in src/app.tsx reads this to programmatically navigate when
   * the `g`-prefix sequence completes.
   */
  target?: string;
}

export const shortcuts = {
  cheatsheet: {
    keys: ["?"],
    label: "Open keyboard shortcuts",
    category: "modals",
    scope: "global",
  },
  close: {
    keys: ["Esc"],
    label: "Close modal / drawer / popup",
    category: "modals",
    scope: "global",
  },
  tweaks: {
    keys: ["Ctrl", "Shift", "T"],
    label: "Toggle theme tweaks panel",
    category: "tweaks",
    scope: "global",
  },
  "nav-dashboard": {
    keys: ["g", "d"],
    label: "Go to Dashboard",
    category: "navigation",
    scope: "global",
    target: "/",
  },
  "nav-deployments": {
    keys: ["g", "D"],
    label: "Go to Deployments",
    category: "navigation",
    scope: "global",
    target: "/deployments",
  },
  "nav-definitions": {
    keys: ["g", "f"],
    label: "Go to Process definitions",
    category: "navigation",
    scope: "global",
    target: "/definitions",
  },
  "nav-instances": {
    keys: ["g", "i"],
    label: "Go to Process instances",
    category: "navigation",
    scope: "global",
    target: "/instances",
  },
  "nav-tasks": {
    keys: ["g", "t"],
    label: "Go to Tasks",
    category: "navigation",
    scope: "global",
    target: "/tasks",
  },
  "nav-jobs": {
    keys: ["g", "j"],
    label: "Go to Jobs",
    category: "navigation",
    scope: "global",
    target: "/jobs",
  },
  "nav-history": {
    keys: ["g", "h"],
    label: "Go to History",
    category: "navigation",
    scope: "global",
    target: "/history",
  },
  "nav-identity": {
    keys: ["g", "u"],
    label: "Go to Identity (users + groups)",
    category: "navigation",
    scope: "global",
    target: "/identity",
  },
  "nav-tenants": {
    keys: ["g", "e"],
    label: "Go to Tenants",
    category: "navigation",
    scope: "global",
    target: "/tenants",
  },
  "nav-decisions": {
    keys: ["g", "r"],
    label: "Go to Decisions",
    category: "navigation",
    scope: "global",
    target: "/decisions",
  },
  "nav-bpmn": {
    keys: ["g", "b"],
    label: "Go to BPMN modeler",
    category: "navigation",
    scope: "global",
    target: "/bpmn",
  },
  "nav-dmn": {
    keys: ["g", "m"],
    label: "Go to DMN modeler",
    category: "navigation",
    scope: "global",
    target: "/dmn",
  },
} as const satisfies Record<ShortcutKey, ShortcutEntry>;

export function getShortcut(key: ShortcutKey): ShortcutEntry {
  const entry = shortcuts[key];
  if (!entry) {
    // Unreachable at runtime — tsc + the `satisfies` clause guarantee
    // every ShortcutKey resolves. Throw to surface programmer error in tests.
    throw new Error(`Unknown shortcut key: ${key}`);
  }
  return entry;
}

export function listShortcuts(): ReadonlyArray<ShortcutEntry> {
  return Object.values(shortcuts);
}

export function listShortcutsByCategory(): Record<ShortcutCategory, ReadonlyArray<ShortcutEntry>> {
  const groups: Record<ShortcutCategory, ShortcutEntry[]> = {
    navigation: [],
    tweaks: [],
    modals: [],
  };
  for (const entry of Object.values(shortcuts)) {
    groups[entry.category].push(entry);
  }
  return groups;
}
