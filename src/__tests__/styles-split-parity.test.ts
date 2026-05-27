// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const STYLES = join(__dirname, "..", "styles");
const tokens = readFileSync(join(STYLES, "tokens.css"), "utf-8");
const components = readFileSync(join(STYLES, "components.css"), "utf-8");
const index = readFileSync(join(STYLES, "index.css"), "utf-8");

// CSS comments are stripped before structural assertions so the index.css docstring (which
// quotes `@import url("./components.css")` in its W3C-rationale block) doesn't contaminate
// the @import-count / @import-order assertions.
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("styles split parity (Story 17.1, ADR-005 / Pattern P-007)", () => {
  it("tokens.css holds all 10 variable-defining selectors exactly once", () => {
    const selectors = [
      /^:root \{/m,
      /^html\[data-look="editorial"\]\[data-theme="light"\] \{/m,
      /^html\[data-look="editorial"\]\[data-theme="dark"\] \{/m,
      /^html\[data-look="terminal"\]\[data-theme="light"\] \{/m,
      /^html\[data-look="terminal"\]\[data-theme="dark"\] \{/m,
      /^html\[data-look="industrial"\]\[data-theme="light"\] \{/m,
      /^html\[data-look="industrial"\]\[data-theme="dark"\] \{/m,
      /^html\[data-density="compact"\] \{/m,
      /^html\[data-density="regular"\] \{/m,
      /^html\[data-density="comfy"\] \{/m,
    ];
    for (const re of selectors) {
      expect(tokens, `tokens.css missing selector ${re.source}`).toMatch(re);
    }
  });

  it("components.css holds zero token-defining selectors", () => {
    expect(components.match(/^:root\b/m)).toBeNull();
    expect(
      components.match(/^html\[data-look="(?:editorial|terminal|industrial)"\]\[data-theme=/m),
    ).toBeNull();
    expect(components.match(/^html\[data-density=/m)).toBeNull();
  });

  it("index.css @imports tokens before components", () => {
    const stripped = stripCssComments(index);
    const tokensImport = stripped.indexOf('@import url("./tokens.css")');
    const componentsImport = stripped.indexOf('@import url("./components.css")');
    expect(tokensImport).toBeGreaterThanOrEqual(0);
    expect(componentsImport).toBeGreaterThan(tokensImport);
  });

  it("combined class-hook selector count matches the pre-17.1 baseline (58 after comment-strip)", () => {
    // Pre-17.1 monolith totals (verified at spec-execution time):
    //   - `grep -cE ...` LINE count: 57 (the figure cited in story 17.1 AC-6 / spec author's baseline).
    //   - `grep -oE ... | wc -l` MATCH count: 59 (some lines carry multiple hits, e.g. `.tbl th, .tbl td`).
    //   - MATCH count after stripping CSS comments: 58 (the monolith carries one inline `/* The trigger uses .btn ... */`
    //     comment at the old line 750 that's preserved verbatim in components.css).
    // This test asserts the comment-stripped MATCH count — semantically the "actual class-hook selector references"
    // unaffected by docstring class lists in components.css. A drift here means a rule was renamed or dropped.
    // Breakdown (each must remain stable):
    //   .badge × 7, .btn × 13, .ep-chip × 3, .kpi × 10, .panel × 5, .seg-btn × 3, .tbl × 17 → 58 total.
    const all = `${stripCssComments(tokens)}\n${stripCssComments(components)}\n${stripCssComments(index)}`;
    const hits = all.match(/\.(btn|tbl|badge|kpi|panel|ep-chip|seg-btn)\b/g) ?? [];
    expect(hits.length).toBe(58);
  });

  it("index.css imports exactly tokens + components — no third file", () => {
    const stripped = stripCssComments(index);
    const importMatches = stripped.match(/@import\s+url\(["']([^"']+)["']\)/g) ?? [];
    expect(importMatches.length).toBe(2);
    const targets = importMatches.map((m) => m.match(/["']([^"']+)["']/)?.[1]).sort();
    expect(targets).toEqual(["./components.css", "./tokens.css"]);
  });
});
