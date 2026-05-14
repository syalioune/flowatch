# QGT-SYS-008: Add visual snapshot baseline for the API Inspector (single look × theme × density)

> **User Story ID**: QGT-SYS-008
> **Persona**: SYS
> **Epic**: 2 — Vitest + Playwright Test Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 2.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:qgt, release:0.0.1


As a maintainer, I want at least one visual snapshot guarding the API Inspector's appearance, so that accidental design-system regressions surface as failing tests. Per NFR-23.

**Acceptance Criteria:**

**Given** Playwright is wired (Story 2.3)
**When** `e2e/visual/api-inspector.spec.ts` runs the app in `editorial / light / regular` and takes a snapshot of the Inspector drawer with 3 sample API_LOG entries
**Then** `npx playwright test --update-snapshots` produces the baseline
**And** subsequent `npx playwright test` passes against the baseline
**And** the test verifies the method-coloured pill mapping (GET → info, POST → ok, PUT → warn, DELETE → bad).
