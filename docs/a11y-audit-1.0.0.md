<!-- SPDX-License-Identifier: Apache-2.0 -->

# Flowatch — axe-core accessibility audit (v1.0.0)

> **Predecessor.** This is the broad automated-rule-engine audit. The earlier
> [a11y-audit-2026-05.md](a11y-audit-2026-05.md) is the **contrast-only**
> snapshot (design-system token math for 4 text/background pairs across the
> look × theme grid). This audit measures the **rendered DOM** with the axe-core
> engine, so it covers contrast (against the *composited* colours actually
> painted), ARIA validity, accessible names, roles, labels, focusable scroll
> regions, duplicate ids, and more. Where the two disagree, see
> [§ Reconciliation with the token-math contrast audit](#reconciliation-with-the-token-math-contrast-audit).

## Audit metadata

| Field | Value |
|---|---|
| Audit date | 2026-06-13 |
| Audit author | Alioune (`syalioune`) + AI (`claude-opus-4-8`) |
| Engine | axe-core **4.11.4** via `@axe-core/playwright` **4.11.3** (devDependency) |
| Rule tags scanned | `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` |
| Scan spec | [e2e/a11y/axe-scan.spec.ts](../e2e/a11y/axe-scan.spec.ts) |
| Shared screen registry | [e2e/a11y/screens.ts](../e2e/a11y/screens.ts) |
| Matrix dimensions | **15 top-level screens × 3 looks × 2 themes = 90 cells** |
| Cells scanned | 90 / 90 |
| Reproduce | `npx playwright test e2e/a11y/axe-scan.spec.ts` (live stack auto-spawned by Playwright `webServer`) |
| Machine-readable output | `e2e/a11y/.axe-results.json` (git-ignored; regenerated each run) |
| Regression guard | the scan spec itself (advisory in 32.1) → **hard `expect(violations).toEqual([])` gate lands in Story 32.2** |
| NFRs | NFR-15 (keyboard), NFR-16 (contrast), NFR-17 (form labels / aria) — [prd.md:439-441] |

> **Stale-number note.** The epic title says "8 look × theme combos / 11
> screens". Both are planning-era estimates and are **wrong**. The real matrix
> is **6** look × theme combinations (3 looks `editorial` / `terminal` /
> `industrial` × 2 themes `light` / `dark` — derived from
> [src/styles/tokens.css](../src/styles/tokens.css)) and **15** top-level
> screens (derived from [src/routes/](../src/routes/); Epics 24/25/27 added
> `/app-definitions`, `/batches`, `/events`). The story key keeps the stale
> numbers for traceability; this report reflects reality.

## Scope

**IN** — every top-level route, each scanned in all 6 look × theme combinations:

`/` · `/deployments` · `/definitions` · `/instances` · `/tasks` · `/jobs` ·
`/history` · `/identity` · `/tenants` · `/decisions` · `/app-definitions` ·
`/batches` · `/events` · `/bpmn` · `/dmn`

Screens were scanned against the **live engine** (`flowable-rest:7.2.0`). Most
list screens rendered **populated** tables from real seed data; a few rendered
**empty / error** states (e.g. screens whose endpoint returned no rows). Error
boxes are themselves valid in-scope axe targets and were audited as rendered.

**OUT / excluded** (AC #7 / AC #8):

- **Modeler canvas internals** (`.djs-container` SVG on `/bpmn` and `/dmn`).
  bpmn-js / dmn-js ship their own theming and DOM — out-of-tree, mirroring the
  predecessor audit's documented exclusion. The scan scopes itself to the
  Flowatch chrome via `AxeBuilder.exclude(".djs-container")`, so **zero**
  canvas-internal findings surfaced (the exclusion is verified, not asserted
  away). The Flowatch-authored modeler chrome — toolbar, dropdowns, deploy row,
  and the BPMN properties panel — **is** in scope and **did** produce findings
  (see the `label` rule).
- **Detail `$id` routes** (`/instances/$id`, `/tasks/$id`, …) — deferred. They
  require reachable seed ids that are not reliably present on a fresh stack; the
  keyboard / aria specs restrict to top-level routes for the same reason. A
  future story may seed fixtures and extend the matrix. No detail-route markup
  is faked.
- **Densities** (`data-density`) and **accent palettes** (`ACCENT_PALETTES`) —
  same exclusions as the predecessor audit; they override sizing / accent only.

## Scoring rubric (AC #5)

axe-core emits no native 0-100 score, so we define one deterministically:

```
weight = { critical: 10, serious: 5, moderate: 2, minor: 1 }
score  = 100 − Σ over distinct (ruleId × cell) violations of weight[impact]
```

- A **distinct violation** = one `(ruleId, screen, look, theme)` tuple. The same
  rule failing on 6 look × theme cells of one screen counts 6× (each is a
  separately-renderable defect).
- **"Won't ship" / blocking = `critical` or `serious` impact** → the
  `fix-in-32.2` set.
- `moderate` / `minor` MAY be dispositioned `won't-fix` for v1.0 with rationale
  and still clear the **≥ 95** gate, as long as the weighted score holds.

### Computed score

| Rule | Impact | Distinct cells | Weight | Penalty |
|---|---|---:|---:|---:|
| `label` | critical | 90 | 10 | 900 |
| `scrollable-region-focusable` | serious | 90 | 5 | 450 |
| `color-contrast` | serious | 42 | 5 | 210 |
| `select-name` | critical | 6 | 10 | 60 |
| **Total penalty** | | **228** | | **1620** |

**Final a11y score = 100 − 1620 = −1520.**

> **This is the *measurement* baseline, not a passing grade.** Story 32.1 is the
> MEASURE half of the 32.1 ↔ 32.2 spec-symmetry pair (AC #9, placeholder-then-
> real): it records findings; it does **not** gate CI on them. Every one of the
> four rules is `critical` or `serious` (= "won't ship"), so the entire set is
> `fix-in-32.2`. There are **zero** `won't-fix` findings — nothing out-of-tree
> survived the canvas exclusion, and no finding is a false positive (see the
> reconciliation below). After Story 32.2 remediates the four root causes and
> re-runs this scan, the score returns to the ≥ 95 gate.

## Per-rule summary

| Rule | Impact | Distinct cells | Total nodes | Disposition |
|---|---|---:|---:|---|
| `label` | critical | 90 | 108 | **fix-in-32.2** |
| `scrollable-region-focusable` | serious | 90 | 90 | **fix-in-32.2** |
| `color-contrast` | serious | 42 | 243 | **fix-in-32.2** |
| `select-name` | critical | 6 | 6 | **fix-in-32.2** |

`won't-fix`: **none.**

## Per-violation detail (grouped by root cause)

The 447 violation-nodes collapse to **four root-cause defects**. Each is a
single shared component reused across screens — fixing the component clears the
finding across every cell it appears in.

### 1. `label` (critical) — form controls without an accessible name

`Form elements must have labels` — [dequeuniversity.com/rules/axe/4.10/label](https://dequeuniversity.com/rules/axe/4.10/label)

Found on **all 15 screens × 6 combos (90 cells, 108 nodes)**. Distinct node
families:

- **`.input` — the Topbar search box** ([src/components.tsx:435](../src/components.tsx#L435)):
  `<input placeholder="Search processes, instances, tasks…">` has no `<label>`,
  `aria-label`, or `aria-labelledby`. It is part of the global Topbar, so it
  fails on **every** screen — the single biggest contributor.
- **`.form-row > .input[value=""]` and `div > .input`** — filter-strip inputs on
  the list screens (e.g. the App-definitions / Events filter inputs) that
  render with a placeholder but no associated label.
- **`input[data-testid="bpmn-prop-initiator"]`** — and sibling text inputs in
  the BPMN properties panel chrome ([src/modeler/](../src/modeler/)) — Flowatch
  chrome, in scope (NOT canvas internals).

### 2. `scrollable-region-focusable` (serious) — scrollable region not keyboard-reachable

`Scrollable region must have keyboard access` — [dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable](https://dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable)

Found on **all 15 screens × 6 combos (90 cells, 90 nodes)**, single node family:

- **`.code` — the PageHead "try it" snippet block**
  ([src/components.tsx:1060](../src/components.tsx#L1060)): a `<div className="code">`
  rendering the curl/fetch snippet. It overflows and scrolls but has no
  `tabindex="0"`, so a keyboard-only user cannot scroll it. Part of the
  PageHead, present on every screen.

### 3. `color-contrast` (serious) — insufficient contrast on chips / badges / output rows

`Elements must meet minimum color contrast ratio thresholds` — [dequeuniversity.com/rules/axe/4.10/color-contrast](https://dequeuniversity.com/rules/axe/4.10/color-contrast)

Found on **42 cells, 243 nodes**, across **all 6 look × theme combos** (light
combos ~45 nodes/cell, dark ~36). Distinct node families:

- **`.ep-method[data-m="GET|POST|PUT|DELETE"]`** — the API endpoint method chips
  in the PageHead / ApiInspector. The coloured method labels fail AA against
  their chip background in multiple look/theme combos.
- **`.out-row > span` and `.out-row > .kind`** — ApiInspector output-row text.
- **`.badge[data-tone="ok"]`** — the success-tone status badges on list rows.

These tokens are **NOT** among the four pairs the predecessor token-math audit
checked — see the reconciliation below.

### 4. `select-name` (critical) — `<select>` without an accessible name

`Select element must have an accessible name` — [dequeuniversity.com/rules/axe/4.10/select-name](https://dequeuniversity.com/rules/axe/4.10/select-name)

Found on **the Event subscriptions screen only (6 cells, 6 nodes)**:

- **`select`** — a filter `<select>` on `/events`
  ([src/routes/events/index.tsx](../src/routes/events/index.tsx)) with no
  `aria-label` / associated `<label>`.

## Reconciliation with the token-math contrast audit

The predecessor [a11y-audit-2026-05.md](a11y-audit-2026-05.md) reports **32 of
32 pairs pass AA**, yet axe flags `color-contrast` here. **There is no
contradiction:**

- The token-math audit checks exactly **four** pairs — `--fg`, `--fg-soft`,
  `--fg-mute` on `--bg`, and `--accent-fg` on `--accent`.
- Every axe contrast finding is on a **different, un-audited** token pair:
  the `.ep-method` method-chip colours, `.out-row` text, and `.badge[data-tone]`
  tones. None of these are covered by the four audited pairs.

So axe surfaced real contrast defects in token pairs the 2026-05 math never
examined. These are genuine `fix-in-32.2` findings (per the story's "axe
measures rendered DOM, token math measures the four pairs — a divergence is a
real finding" guidance), not false positives. Story 32.2's fixes should also
**extend** the Pattern P-008 guard in
[src/__tests__/wcag-contrast.test.ts](../src/__tests__/wcag-contrast.test.ts) to
cover the method-chip / badge-tone pairs so the regression cannot recur.

## `fix-in-32.2` checklist (input contract for Story 32.2)

Copy-pasteable. Fixing the four shared components clears all 90 cells.

- [ ] `label` @ **Topbar search input** — add an accessible name to
      `<input>` in [src/components.tsx:435](../src/components.tsx#L435)
      (`aria-label="Search"` or a visually-hidden `<label>`). Clears the
      dominant `label` finding across all 15 screens.
- [ ] `label` @ **list-screen filter inputs** (`.form-row > .input`,
      `div > .input`) — associate each filter `<input>` with a `<label>` or
      `aria-label` (App-definitions, Events, and any other filter strips).
- [ ] `label` @ **BPMN properties-panel inputs**
      (`input[data-testid="bpmn-prop-initiator"]` + siblings) in
      [src/modeler/](../src/modeler/) — add labels / `aria-label`.
- [ ] `scrollable-region-focusable` @ **PageHead `.code` snippet block**
      ([src/components.tsx:1060](../src/components.tsx#L1060)) — add
      `tabindex={0}` (and a `role="region"` + `aria-label` for the snippet) so
      the scroll region is keyboard-reachable.
- [ ] `color-contrast` @ **`.ep-method[data-m]` method chips** — raise contrast
      of the GET/POST/PUT/DELETE chip foreground vs background across all 6
      look × theme combos (token edit in [src/styles/tokens.css](../src/styles/tokens.css)
      / [components.css](../src/styles/components.css)).
- [ ] `color-contrast` @ **`.out-row > span` / `.out-row > .kind`** (ApiInspector
      output rows) — raise text contrast.
- [ ] `color-contrast` @ **`.badge[data-tone="ok"]`** status badges — raise the
      success-tone contrast vs the badge background.
- [ ] `color-contrast` — **extend** the Pattern P-008 contrast guard
      ([src/__tests__/wcag-contrast.test.ts](../src/__tests__/wcag-contrast.test.ts))
      to cover the newly-audited method-chip / badge-tone pairs.
- [ ] `select-name` @ **Events filter `<select>`**
      ([src/routes/events/index.tsx](../src/routes/events/index.tsx)) — add
      `aria-label` / associated `<label>`.
- [ ] After fixes: re-run `npx playwright test e2e/a11y/axe-scan.spec.ts`,
      confirm score ≥ 95, then flip the spec's advisory assertion to a hard
      `expect(violations).toEqual([])` gate (AC #9 → 32.2).

## Re-run cadence

This dated audit is a snapshot at the v1.0.0 milestone. Re-author a new dated
audit (`a11y-audit-<next>.md`) when: a new look or theme variant is added; the
matrix gains detail routes; or annually. The CI regression guard becomes a hard
gate in Story 32.2 — after that, a new axe violation breaks the build rather
than merely appending to the next dated report.
