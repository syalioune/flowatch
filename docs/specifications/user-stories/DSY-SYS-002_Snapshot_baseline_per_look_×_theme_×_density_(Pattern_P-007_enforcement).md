# DSY-SYS-002: Snapshot baseline per look × theme × density (Pattern P-007 enforcement)

> **User Story ID**: DSY-SYS-002
> **Persona**: SYS
> **Epic**: 17 — Design System — three looks × themes × densities
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 17.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dsy, release:0.0.2


As a maintainer, I want one Playwright snapshot per look × theme × density (18 baselines) of the Dashboard, so that theming regressions surface immediately. Per NFR-23.

**Acceptance Criteria:**

**Given** Playwright is wired (Epic 2)
**When** `e2e/visual/dashboard-themes.spec.ts` iterates over the 3×2×3=18 combinations and snapshots `/` for each
**Then** `npx playwright test --update-snapshots` produces 18 baselines
**And** subsequent runs assert against the baselines
**And** changing one CSS variable in a single combination's `:root` block fails exactly one snapshot (proving the snapshots are sensitive to drift).

---
