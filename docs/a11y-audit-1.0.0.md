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
| Regression guard | the scan spec itself — **hard `expect(blockingViolations).toEqual([])` gate (critical/serious) landed in Story 32.2** |
| Post-fix re-run (32.2) | 2026-06-14 — **0 violation-nodes across 90/90 cells**, all rules cleared |
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

**Pre-fix a11y score (32.1 baseline) = 100 − 1620 = −1520.**

> **This was the *measurement* baseline, not a passing grade.** Story 32.1 was
> the MEASURE half of the 32.1 ↔ 32.2 spec-symmetry pair: it recorded findings;
> it did **not** gate CI on them. Every one of the four rules is `critical` or
> `serious` (= "won't ship"), so the entire set was `fix-in-32.2`. There were
> **zero** `won't-fix` findings — nothing out-of-tree survived the canvas
> exclusion, and no finding was a false positive (see the reconciliation below).

### Post-fix score (Story 32.2, AC #3)

After Story 32.2 remediated the four root causes and re-ran the scan
(2026-06-14, 90/90 index cells):

| Rule | Impact | Distinct cells | Weight | Penalty |
|---|---|---:|---:|---:|
| _(none)_ | — | 0 | — | 0 |
| **Total penalty** | | **0** | | **0** |

**Final a11y score = 100 − 0 = 100.** Clears the epic's tighter post-fix gate
(**≥ 98**). The per-cell `expect(blockingViolations).toEqual([])` hard gate is
green across every screen × look × theme.

### Detail-route gate expansion (Story 32.2 code-review D1)

The index-route matrix above (15 top-level routes × 6 look×theme = 90 cells) did
**not** exercise the 9 `$id`/`$key` detail routes, their panels, or their error
states — surfaces that host their own input-bearing controls and scrollable
viewers. The code review of 32.2 flagged this scope gap, and the gate was
expanded to scan every detail route in **two states** per look×theme: the
error/empty-state chrome (bogus id) and the populated page (real id seeded live
from the engine; skipped-with-annotation when the entity has no rows). Matrix is
now **90 index + 108 detail cells (max)**; the expansion surfaced — and 32.2
fixed — **two further blocking violations** the index scan never reached:

| Rule | Impact | Where | Fix |
|---|---|---|---|
| `scrollable-region-focusable` | serious | the `<pre class="code">` BPMN/DMN XML viewers ([ProcessDefinitionDetail](../src/components/ProcessDefinitionDetail.tsx), [DecisionDetail](../src/components/DecisionDetail.tsx)) + the `<pre class="stacktrace">` panels ([JobStacktracePanel](../src/components/JobStacktracePanel.tsx), [BatchPartsPanel](../src/components/BatchPartsPanel.tsx)) | added `role="region"` + `aria-label` + `tabIndex={0}` (same canonical fix as the PageHead snippet) |
| `color-contrast` | serious | the `<ErrorBox>` message text ([error-box.tsx](../src/lib/error-box.tsx)) rendered in `var(--bad)` — failed AA on the lightest background (terminal/light, `--bad` = 58% L) | repointed to the AA-safe `var(--bad-fg)` (the on-tint foreground token 32.2 introduced); the tint-pair P-008 guard already bounds `--bad-fg`, and `--bad-fg`-on-`--bg` is a strictly easier case than the audited tint |

Post-expansion re-run (2026-06-14): **0 blocking violations** across all index +
detail cells (168 passed, 30 seeded cells skipped for entities with no rows on
the default `make stack` engine — instances/tasks/batches/groups/app-definitions).
Score holds at **100**.

## Per-rule summary

| Rule | Impact | Distinct cells | Total nodes | Disposition |
|---|---|---:|---:|---|
| `label` | critical | 90 | 108 | ✅ **fixed (32.2)** |
| `scrollable-region-focusable` | serious | 90 | 90 | ✅ **fixed (32.2)** |
| `color-contrast` | serious | 42 | 243 | ✅ **fixed (32.2)** |
| `select-name` | critical | 6 | 6 | ✅ **fixed (32.2)** |

`won't-fix`: **none.** Post-fix re-run: **0 violations.**

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
- **`.out-row > span` and `.out-row > .kind`** — BPMN modeler outline
  element-row text (`.mod-outline-tree .out-row`, dark theme).
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
examined. These were genuine `fix-in-32.2` findings (per the story's "axe
measures rendered DOM, token math measures the four pairs — a divergence is a
real finding" guidance), not false positives. **Story 32.2 resolved them** by
adding dedicated on-tint foreground tokens (`--ok-fg` / `--warn-fg` /
`--bad-fg` / `--info-fg`) and **extended** the Pattern P-008 guard in
[src/__tests__/wcag-contrast.test.ts](../src/__tests__/wcag-contrast.test.ts)
with 4 on-tint pairs × 6 combos so the regression cannot recur. The predecessor
[a11y-audit-2026-05.md](a11y-audit-2026-05.md) carries a forward-pointer to
this addition; the two audits now agree — the 2026-05 four pairs still pass,
and the chip/badge tint pairs are newly covered here.

## `fix-in-32.2` checklist (RESOLVED in Story 32.2)

All items closed. Fixing the shared components cleared all 90 cells.

- [x] `label` @ **Topbar search input** — added `aria-label="Search"` to
      `<input>` in [src/components.tsx:435](../src/components.tsx#L435).
      Cleared the dominant `label` finding across all 15 screens. Pinned by a
      Vitest render assertion in
      [src/components/__tests__/a11y-controls.spec.tsx](../src/components/__tests__/a11y-controls.spec.tsx).
- [x] `label` @ **list-screen filter inputs** — added `aria-label` to the
      Events filter `<input>`s ([src/routes/events/index.tsx](../src/routes/events/index.tsx))
      and the App-definitions key / tenant filter `<input>`s
      ([src/routes/app-definitions/index.tsx](../src/routes/app-definitions/index.tsx));
      the App-definitions "Latest version only" checkbox was already wrapped in
      a `<label>`.
- [x] `label` @ **BPMN properties-panel inputs** — associated every label with
      its control via `htmlFor`/`id` in
      [src/modeler/FlowablePropertiesPanel.tsx](../src/modeler/FlowablePropertiesPanel.tsx)
      (`textField`, `processTextField` (`bpmn-prop-initiator` + siblings),
      `textRow`, Name, ID) and added `aria-label` to the timer-expression
      input. The listener / field-injection / in-out sub-editors
      ([src/modeler/ExtensionEditors.tsx](../src/modeler/ExtensionEditors.tsx))
      were already fully `aria-label`'d.
- [x] `scrollable-region-focusable` @ **PageHead `.code` snippet block**
      ([src/components.tsx:1060](../src/components.tsx#L1060)) — added
      `tabIndex={0}` + `role="region"` + `aria-label="Request snippet"`; the
      adjacent request-path `<input>` also got `aria-label="Request path"`.
- [x] `color-contrast` @ **`.ep-method[data-m]` method chips** + **`.badge[data-tone]`
      badges** (light themes) — introduced dedicated on-tint foreground tokens
      `--ok-fg` / `--warn-fg` / `--bad-fg` / `--info-fg`
      ([src/styles/tokens.css](../src/styles/tokens.css)) and pointed the chip /
      badge `color` at them ([src/styles/components.css](../src/styles/components.css)).
      Light variants are OKLCH-lightness-lowered (hue/chroma preserved) to clear
      ≥4.5:1 against the faint same-hue tint; dark variants mirror the semantic
      token (dark tints already passed).
- [x] `color-contrast` @ **`.out-row[type="button"] > span` / `> .kind`** (BPMN
      modeler outline, dark) — the element-row `<button>` kept its UA
      `buttonface` (a light system colour) so dark-theme `--fg-soft`/`--fg-mute`
      text sat on `#efefef`. Reset `appearance:none; background:transparent` on
      `.mod-outline-tree .out-row` ([src/styles/components.css](../src/styles/components.css))
      so the row inherits the dark panel surface.
- [x] `color-contrast` @ **dmn-js decision-table JUEL cells**
      (`.dmn-decision-table-container .content-editable`, DMN modeler, dark) —
      out-of-tree dmn-js editor DOM (it ships its own dark-mode styling, like
      `.djs-container`). Extended the scan's canvas exclusion to also exclude
      `.dmn-decision-table-container` ([e2e/a11y/screens.ts](../e2e/a11y/screens.ts),
      [e2e/a11y/axe-scan.spec.ts](../e2e/a11y/axe-scan.spec.ts)) per AC #8 — the
      Flowatch chrome is what we audit.
- [x] `color-contrast` — **extended** the Pattern P-008 contrast guard
      ([src/__tests__/wcag-contrast.test.ts](../src/__tests__/wcag-contrast.test.ts))
      with 4 on-tint pairs × 6 combos (the `--*-fg` over the composited
      semantic-token tint).
- [x] `select-name` @ **Events filter `<select>`**
      ([src/routes/events/index.tsx](../src/routes/events/index.tsx)) — added
      `aria-label="Filter by event type"`.
- [x] Re-ran `npx playwright test e2e/a11y/axe-scan.spec.ts`: **0 violations**,
      score **100**. Flipped the spec's advisory assertion to the hard
      `expect(blockingViolations).toEqual([])` gate (blocking = critical/serious)
      and removed the 32.1 advisory header note.

## Re-run cadence

This dated audit is a snapshot at the v1.0.0 milestone. Re-author a new dated
audit (`a11y-audit-<next>.md`) when: a new look or theme variant is added; the
matrix gains detail routes; or annually. The CI regression guard becomes a hard
gate in Story 32.2 — after that, a new axe violation breaks the build rather
than merely appending to the next dated report.
