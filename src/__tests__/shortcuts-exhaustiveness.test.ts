// SPDX-License-Identifier: Apache-2.0
//
// Story 18.4 — keyboard shortcuts registry exhaustiveness + per-entry invariants.
//
// Pattern P-008 token-contract guard, fourth application after
// wcag-contrast.test.ts (17.3), empty-states-exhaustiveness.test.ts (17.5),
// and sr-only-class.test.ts (18.2). Per CLAUDE.md "Never extract at N=4",
// the inline-parse-and-iterate shape is preserved — no shared helper.
//
// The `satisfies Record<ShortcutKey, ShortcutEntry>` in src/lib/shortcuts.ts
// is the compile-time guarantee that every key has an entry. This test is
// defense-in-depth at the literal level: an empty `keys: []` or a missing
// `label: ""` would tsc-check fine but fail here.

import { describe, expect, it } from "vitest";
import {
  getShortcut,
  listShortcuts,
  listShortcutsByCategory,
  type ShortcutCategory,
  type ShortcutKey,
  shortcuts,
} from "../lib/shortcuts";

const VALID_CATEGORIES: ReadonlyArray<ShortcutCategory> = ["navigation", "tweaks", "modals"];

describe("shortcuts registry exhaustiveness (Story 18.4 AC-2)", () => {
  it("getShortcut returns a non-undefined entry for every key", () => {
    const keys = Object.keys(shortcuts) as ShortcutKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const entry = getShortcut(k);
      expect(entry).toBeDefined();
      expect(typeof entry.label).toBe("string");
    }
  });

  it("every entry has a non-empty keys array", () => {
    for (const [key, entry] of Object.entries(shortcuts)) {
      expect(entry.keys.length, `keys for "${key}" must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty label ≤ 80 chars", () => {
    for (const [key, entry] of Object.entries(shortcuts)) {
      expect(entry.label.length, `label for "${key}" must be non-empty`).toBeGreaterThan(0);
      expect(entry.label.length, `label for "${key}" must be ≤ 80 chars`).toBeLessThanOrEqual(80);
    }
  });

  it("every entry has a valid category", () => {
    for (const [key, entry] of Object.entries(shortcuts)) {
      expect(
        VALID_CATEGORIES.includes(entry.category),
        `category for "${key}" must be one of ${VALID_CATEGORIES.join(", ")}`,
      ).toBe(true);
    }
  });

  it("every entry has scope === 'global' (until per-screen scope arrives)", () => {
    for (const [key, entry] of Object.entries(shortcuts)) {
      expect(entry.scope, `scope for "${key}" must be 'global'`).toBe("global");
    }
  });

  it("no two entries collide on the keys tuple", () => {
    const seen = new Map<string, string>();
    for (const [key, entry] of Object.entries(shortcuts)) {
      const sig = entry.keys.join("+");
      const prev = seen.get(sig);
      expect(prev, `keys [${sig}] collide between "${prev}" and "${key}"`).toBeUndefined();
      seen.set(sig, key);
    }
  });

  it("getShortcut('cheatsheet') returns the entry with keys: ['?']", () => {
    const entry = getShortcut("cheatsheet");
    expect(entry.keys).toEqual(["?"]);
    expect(entry.category).toBe("modals");
  });

  it("every navigation-category entry has a `target` route", () => {
    for (const [key, entry] of Object.entries(shortcuts)) {
      if (entry.category === "navigation") {
        expect(entry.target, `nav entry "${key}" must declare a target route`).toBeTruthy();
        expect(entry.target?.startsWith("/")).toBe(true);
      }
    }
  });

  it("listShortcutsByCategory partitions entries by category", () => {
    const grouped = listShortcutsByCategory();
    expect(grouped.navigation.length).toBeGreaterThan(0);
    expect(grouped.tweaks.length).toBeGreaterThan(0);
    expect(grouped.modals.length).toBeGreaterThan(0);
    const total = grouped.navigation.length + grouped.tweaks.length + grouped.modals.length;
    expect(total).toBe(listShortcuts().length);
  });
});
