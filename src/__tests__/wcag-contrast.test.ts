// SPDX-License-Identifier: Apache-2.0
//
// WCAG 2.1 AA contrast verification across the 8 look × theme combinations.
//
// Audits the four "interactive" colour pairs per combination:
//   - --fg        on --bg     (body text on page bg)
//   - --fg-soft   on --bg     (secondary text)
//   - --fg-mute   on --bg     (tertiary / muted text — closest to threshold)
//   - --accent-fg on --accent (button text on accent fill)
//
// 8 combinations × 4 pairs = 32 assertions.
//
// SCOPE
// -----
// Densities (compact / regular / comfy) are EXPLICITLY out of scope. The
// density blocks at src/styles/tokens.css declare only sizing variables
// (--gap / --row-h / --pad / --fs) — they do NOT override colour tokens.
// If a future density variant adds colour, the test scope expands to 24
// combinations (8 × 3) and this header comment is the migration target.
//
// The OKLCH ACCENT_PALETTES at src/app.tsx are operator-pickable at
// runtime; the audit covers the DEFAULT --accent per look × theme block
// only.
//
// SOURCE FILE RESOLUTION
// ----------------------
// Path-dependent on Story 17.1 status: after 17.1, src/styles/tokens.css.
// Before 17.1, src/styles.css. The test iterates `TOKEN_SOURCE_CANDIDATES`
// and uses the first that exists.
//
// SEE ALSO
// --------
// docs/a11y-audit-2026-05.md — the human-readable audit doc, including
//   any documented exceptions and the day-of-audit baseline.
// NFR-16 (WCAG AA) — the load-bearing PRD requirement this test enforces.
// Pattern P-008 (token-contract guard test) — codified by this story; the
//   parse-CSS-then-assert-numeric-invariant shape is reusable for future
//   tests (focus-ring contrast, hover-state distinctness, etc.).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TOKEN_SOURCE_CANDIDATES = ["src/styles/tokens.css", "src/styles.css"];

const LOOKS = ["editorial", "terminal", "industrial"] as const;
const THEMES = ["light", "dark"] as const;

type Pair = { fgVar: string; bgVar: string; label: string };
const PAIRS: Pair[] = [
  { fgVar: "--fg", bgVar: "--bg", label: "body on page" },
  { fgVar: "--fg-soft", bgVar: "--bg", label: "soft on page" },
  { fgVar: "--fg-mute", bgVar: "--bg", label: "mute on page" },
  { fgVar: "--accent-fg", bgVar: "--accent", label: "accent-fg on accent" },
];

const AA_BODY = 4.5;

// Story 32.2 — on-tint status foregrounds. The status chips (.ep-method) and
// badges (.badge[data-tone]) render a coloured label over a FAINT same-hue
// tint of the semantic token (`color-mix(in oklab, var(--X) N%, transparent)`
// composited over --bg). The plain semantic token failed AA as text there, so
// dedicated `--X-fg` variants were added (see src/styles/tokens.css). These
// pairs guard that each `--X-fg` clears AA against the LIGHTEST tint it is used
// on (the badge tint % — chips use a heavier, darker tint, so passing the
// badge tint covers them). sRGB-linear compositing here is conservative vs the
// browser's oklab color-mix, so a green test implies a green render.
type TintPair = { fgVar: string; tokenVar: string; pct: number; label: string };
const TINT_PAIRS: TintPair[] = [
  { fgVar: "--ok-fg", tokenVar: "--ok", pct: 0.12, label: "ok-fg on ok-tint" },
  { fgVar: "--warn-fg", tokenVar: "--warn", pct: 0.14, label: "warn-fg on warn-tint" },
  { fgVar: "--bad-fg", tokenVar: "--bad", pct: 0.14, label: "bad-fg on bad-tint" },
  { fgVar: "--info-fg", tokenVar: "--info", pct: 0.14, label: "info-fg on info-tint" },
];

/** sRGB-linear composite of `token` at `pct` opacity over `bg` (conservative). */
function compositeOver(token: Srgb, pct: number, bg: Srgb): Srgb {
  return {
    r: pct * token.r + (1 - pct) * bg.r,
    g: pct * token.g + (1 - pct) * bg.g,
    b: pct * token.b + (1 - pct) * bg.b,
  };
}

// Documented exceptions — see audit doc for rationale. Shape:
//   { look, theme, pair: "<label>", minRatio: <observed>, reason: "..." }
const EXCEPTIONS: Array<{
  look: string;
  theme: string;
  pair: string;
  minRatio: number;
  reason: string;
}> = [];

// ─────────────────────────────────────────────────────────────────────────
// Helpers — OKLCH/hex/rgb parsing + WCAG luminance + contrast ratio
// ─────────────────────────────────────────────────────────────────────────

type Srgb = { r: number; g: number; b: number };

/** Linear-sRGB → sRGB (gamma encode) → [0, 255] integer. */
function linearToSrgb255(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, encoded)) * 255);
}

/**
 * OKLCH → sRGB via OKLab → linear-sRGB.
 * Reference: Björn Ottosson — https://bottosson.github.io/posts/oklab/
 * CSS Color Module 4 — https://www.w3.org/TR/css-color-4/#color-conversion-code
 */
function oklchToSrgb(L: number, C: number, hDeg: number): Srgb {
  const hRad = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab → linear LMS (cube)
  const lCube = L + 0.3963377774 * a + 0.2158037573 * b;
  const mCube = L - 0.1055613458 * a - 0.0638541728 * b;
  const sCube = L - 0.0894841775 * a - 1.291485548 * b;
  const lLin = lCube ** 3;
  const mLin = mCube ** 3;
  const sLin = sCube ** 3;

  // Linear LMS → linear sRGB
  const rLin = 4.0767416621 * lLin - 3.3077115913 * mLin + 0.2309699292 * sLin;
  const gLin = -1.2684380046 * lLin + 2.6097574011 * mLin - 0.3413193965 * sLin;
  const bLin = -0.0041960863 * lLin - 0.7034186147 * mLin + 1.707614701 * sLin;

  return { r: linearToSrgb255(rLin), g: linearToSrgb255(gLin), b: linearToSrgb255(bLin) };
}

function parseHexToSrgb(hex: string): Srgb {
  const h = hex.replace("#", "");
  const expanded = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, "0");
  const n = Number.parseInt(expanded.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Parse any CSS colour literal currently used in tokens.css to sRGB.
 * Supports: oklch(L% C H), oklch(L% C H / α), #RGB, #RRGGBB, rgb(r g b),
 * rgb(r, g, b), and the bare "#fff" / "#000" hex shorthand.
 * Throws on anything else (currentColor, transparent, var(...)) so the
 * test fails loudly rather than silently coercing to 0,0,0.
 */
function tokenToSrgb(value: string): Srgb {
  const v = value.trim();

  // OKLCH: oklch(L% C H) or oklch(L% C H / α) — alpha is ignored for the audit.
  const oklchMatch = v.match(
    /^oklch\(\s*([0-9.]+)%\s+([0-9.]+)\s+(-?[0-9.]+)(?:\s*\/\s*[0-9.%]+)?\s*\)$/i,
  );
  if (oklchMatch) {
    const L = Number.parseFloat(oklchMatch[1] ?? "") / 100;
    const C = Number.parseFloat(oklchMatch[2] ?? "");
    const h = Number.parseFloat(oklchMatch[3] ?? "");
    return oklchToSrgb(L, C, h);
  }

  if (v.startsWith("#")) return parseHexToSrgb(v);

  // rgb(r g b) or rgb(r, g, b) — space and comma forms.
  const rgbMatch = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+[0-9.]+%?)?\s*\)$/i);
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1] ?? "0", 10),
      g: Number.parseInt(rgbMatch[2] ?? "0", 10),
      b: Number.parseInt(rgbMatch[3] ?? "0", 10),
    };
  }

  throw new Error(`WCAG audit: unsupported token value "${value}"`);
}

/** WCAG relative luminance. https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function relativeLuminance({ r, g, b }: Srgb): number {
  const linearize = (c8: number): number => {
    const c = c8 / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio (1.0 to 21.0). */
function contrastRatio(fg: Srgb, bg: Srgb): number {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const [lighter, darker] = lFg > lBg ? [lFg, lBg] : [lBg, lFg];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Extract a CSS variable map for a given block-opening selector.
 * Selector example: `html[data-look="editorial"][data-theme="light"]`.
 * Returns a Map<--var-name, raw-value-string>.
 */
function parseTokenBlock(css: string, selector: string): Map<string, string> {
  // Escape regex special characters in the selector.
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match: <selector> { … }
  // The token blocks contain no nested braces, so a lazy `[^}]*` body is sufficient.
  const blockRe = new RegExp(`${esc}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(blockRe);
  if (!m) throw new Error(`token block not found for selector: ${selector}`);
  const body = m[1] ?? "";
  const out = new Map<string, string>();
  // Match declarations: --name: value;
  // The value may span lines (biome formatter wraps long oklch(...) calls
  // across lines), so [\s\S]+? matches newlines; the lazy quantifier stops
  // at the first `;`. Trailing comments after the `;` are ignored.
  for (const decl of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([\s\S]+?)\s*;/gi)) {
    // Collapse internal whitespace (newlines + indentation) to single
    // spaces so wrapped values like `oklch(\n  52% 0.012 60\n)` parse
    // identically to single-line `oklch(52% 0.012 60)`.
    const collapsed = (decl[2] ?? "").replace(/\s+/g, " ").trim();
    out.set(decl[1] ?? "", collapsed);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Boot — resolve source file + sanity-check helpers
// ─────────────────────────────────────────────────────────────────────────

const sourceFile = (() => {
  for (const candidate of TOKEN_SOURCE_CANDIDATES) {
    const abs = resolve(process.cwd(), candidate);
    if (existsSync(abs)) return { path: candidate, abs };
  }
  throw new Error(
    `WCAG audit: no token source file found. Tried: ${TOKEN_SOURCE_CANDIDATES.join(", ")}`,
  );
})();

const css = readFileSync(sourceFile.abs, "utf-8");

describe("WCAG 2.1 AA contrast — helper sanity checks", () => {
  it("oklch(0% 0 0) parses to black", () => {
    const black = tokenToSrgb("oklch(0% 0 0)");
    expect(black).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("oklch(100% 0 0) parses to white", () => {
    const white = tokenToSrgb("oklch(100% 0 0)");
    expect(white).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("#fff parses to white", () => {
    expect(tokenToSrgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("#000000 parses to black", () => {
    expect(tokenToSrgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("black on white has contrast ratio 21:1", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });

  it("#777 on white sits near the 4.5:1 AA boundary", () => {
    const ratio = contrastRatio({ r: 119, g: 119, b: 119 }, { r: 255, g: 255, b: 255 });
    expect(ratio).toBeGreaterThan(4.4);
    expect(ratio).toBeLessThan(4.6);
  });

  it("throws loudly on unsupported tokens", () => {
    expect(() => tokenToSrgb("currentColor")).toThrow(/unsupported token value/);
    expect(() => tokenToSrgb("var(--bg)")).toThrow(/unsupported token value/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The 32 audit assertions
// ─────────────────────────────────────────────────────────────────────────

describe(`WCAG 2.1 AA contrast — source: ${sourceFile.path}`, () => {
  // Memoize the per-combination parsed token map so we parse each block once.
  const blockCache = new Map<string, Map<string, string>>();
  function getBlock(look: string, theme: string): Map<string, string> {
    const key = `${look}-${theme}`;
    let cached = blockCache.get(key);
    if (!cached) {
      cached = parseTokenBlock(css, `html[data-look="${look}"][data-theme="${theme}"]`);
      blockCache.set(key, cached);
    }
    return cached;
  }

  for (const look of LOOKS) {
    for (const theme of THEMES) {
      describe(`${look} / ${theme}`, () => {
        for (const pair of PAIRS) {
          it(`${pair.label} (${pair.fgVar} on ${pair.bgVar}) — AA ≥ ${AA_BODY}:1`, () => {
            const block = getBlock(look, theme);
            const fgValue = block.get(pair.fgVar);
            const bgValue = block.get(pair.bgVar);
            expect(fgValue, `${look}/${theme} block missing ${pair.fgVar}`).toBeDefined();
            expect(bgValue, `${look}/${theme} block missing ${pair.bgVar}`).toBeDefined();

            const fg = tokenToSrgb(fgValue ?? "");
            const bg = tokenToSrgb(bgValue ?? "");
            const ratio = contrastRatio(fg, bg);

            const exception = EXCEPTIONS.find(
              (e) => e.look === look && e.theme === theme && e.pair === pair.label,
            );
            const threshold = exception ? exception.minRatio : AA_BODY;

            // Useful diagnostic when an assertion fires — names the look,
            // theme, pair, raw token values, and the computed ratio.
            expect(
              ratio,
              `${look}/${theme} ${pair.label}: ${pair.fgVar}=${fgValue} (${rgbHex(fg)}) on ${pair.bgVar}=${bgValue} (${rgbHex(bg)}) → ${ratio.toFixed(2)}:1 < ${threshold}:1${exception ? ` (exception: ${exception.reason})` : ""} — see docs/a11y-audit-2026-05.md`,
            ).toBeGreaterThanOrEqual(threshold);
          });
        }
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Story 32.2 — on-tint status foreground assertions (4 pairs × 6 combos)
// ─────────────────────────────────────────────────────────────────────────

describe(`WCAG 2.1 AA contrast — on-tint status foregrounds (Story 32.2)`, () => {
  const blockCache = new Map<string, Map<string, string>>();
  function getBlock(look: string, theme: string): Map<string, string> {
    const key = `${look}-${theme}`;
    let cached = blockCache.get(key);
    if (!cached) {
      cached = parseTokenBlock(css, `html[data-look="${look}"][data-theme="${theme}"]`);
      blockCache.set(key, cached);
    }
    return cached;
  }

  for (const look of LOOKS) {
    for (const theme of THEMES) {
      describe(`${look} / ${theme}`, () => {
        for (const pair of TINT_PAIRS) {
          it(`${pair.label} — AA ≥ ${AA_BODY}:1`, () => {
            const block = getBlock(look, theme);
            const fgValue = block.get(pair.fgVar);
            const tokenValue = block.get(pair.tokenVar);
            const bgValue = block.get("--bg");
            expect(fgValue, `${look}/${theme} block missing ${pair.fgVar}`).toBeDefined();
            expect(tokenValue, `${look}/${theme} block missing ${pair.tokenVar}`).toBeDefined();
            expect(bgValue, `${look}/${theme} block missing --bg`).toBeDefined();

            const fg = tokenToSrgb(fgValue ?? "");
            const token = tokenToSrgb(tokenValue ?? "");
            const bg = tokenToSrgb(bgValue ?? "");
            const tintBg = compositeOver(token, pair.pct, bg);
            const ratio = contrastRatio(fg, tintBg);

            expect(
              ratio,
              `${look}/${theme} ${pair.label}: ${pair.fgVar}=${fgValue} (${rgbHex(fg)}) on ${(pair.pct * 100) | 0}% ${pair.tokenVar} tint over --bg (${rgbHex(tintBg)}) → ${ratio.toFixed(2)}:1 < ${AA_BODY}:1 — see docs/a11y-audit-1.0.0.md`,
            ).toBeGreaterThanOrEqual(AA_BODY);
          });
        }
      });
    }
  }
});

function rgbHex({ r, g, b }: Srgb): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
