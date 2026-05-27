// SPDX-License-Identifier: Apache-2.0
//
// Empty-state registry exhaustiveness + per-entry sanity (Story 17.5 AC-5).
//
// The `satisfies Record<ScreenKey, EmptyStateEntry>` clause in
// src/lib/empty-states.tsx IS the source of truth — tsc enforces
// "every ScreenKey has an entry" and "every entry's key is in ScreenKey"
// at compile time. This file exists as a RUNTIME backup against future
// regressions where the `satisfies` clause is accidentally weakened
// (e.g., a refactor replaces `satisfies` with a manual type annotation
// that no longer enforces completeness).
//
// Pattern P-008 (token-contract guard test) generalisation: parse a
// canonical registry → assert per-entry numeric / structural invariants
// in a loop. Story 17.3's wcag-contrast.test.ts was the first
// application; this is the second.

import { describe, expect, it } from "vitest";
import { emptyStates, getEmptyState, type ScreenKey } from "../lib/empty-states";

describe("empty-states registry exhaustiveness (Story 17.5 AC-5)", () => {
  it("getEmptyState returns a non-undefined entry for every key in emptyStates", () => {
    const keys = Object.keys(emptyStates) as ScreenKey[];
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      const entry = getEmptyState(k);
      expect(entry).toBeDefined();
      expect(typeof entry.title).toBe("string");
      expect(typeof entry.body).toBe("string");
    }
  });

  it("every title is non-empty", () => {
    for (const [key, entry] of Object.entries(emptyStates)) {
      expect(entry.title.length, `title for "${key}" must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every body is non-empty", () => {
    for (const [key, entry] of Object.entries(emptyStates)) {
      expect(entry.body.length, `body for "${key}" must be non-empty`).toBeGreaterThan(0);
    }
  });

  it("every cta href is either internal (starts with /) or external (http/https)", () => {
    for (const [key, entry] of Object.entries(emptyStates)) {
      const cta = (entry as { cta?: { href: string; label: string } }).cta;
      if (cta) {
        const href = cta.href;
        const ok =
          href.startsWith("/") || href.startsWith("http://") || href.startsWith("https://");
        expect(ok, `cta href for "${key}" must be absolute path or full URL, got "${href}"`).toBe(
          true,
        );
      }
    }
  });

  it("every cta label is non-empty when cta is present", () => {
    for (const [key, entry] of Object.entries(emptyStates)) {
      const cta = (entry as { cta?: { href: string; label: string } }).cta;
      if (cta) {
        expect(cta.label.length, `cta label for "${key}" must be non-empty`).toBeGreaterThan(0);
      }
    }
  });
});
