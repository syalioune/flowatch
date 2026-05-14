# I18N-SYS-001: Visual snapshot per screen × per look (lighter than 17.4)

> **User Story ID**: I18N-SYS-001
> **Persona**: SYS
> **Epic**: 18 — Accessibility + Snapshot Coverage
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 18.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:i18n, release:0.0.2


As a maintainer, I want one visual snapshot per screen in `editorial / light / regular`, so that screen-level regressions surface (independent of the look-combination matrix from 17.4). Per NFR-23.

**Acceptance Criteria:**

**Given** every screen is routable
**When** `e2e/visual/per-screen.spec.ts` snapshots each of the 11 screens in the default look × theme × density
**Then** 11 baselines exist
**And** changing any screen's structure breaks the corresponding snapshot.

---
