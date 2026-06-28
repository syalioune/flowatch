# HST-MIR-005: Run end-to-end a11y audit across 8 look × theme combos + 11 screens

> **User Story ID**: HST-MIR-005
> **Persona**: MIR
> **Epic**: 32 — Full Accessibility Audit
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 32.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:hst, release:1.0.0


As Mira (operator with accessibility needs), I want a full a11y audit producing a list of issues + fix plan, so that v1.0 is genuinely accessible. Per NFR-15-NFR-17.

**Acceptance Criteria:**

**Given** all screens are implemented and routable
**When** an automated a11y scan (axe-core via Playwright) is run on every screen × every look × every theme
**Then** the report is produced at `docs/a11y-audit-1.0.0.md`
**And** every violation is either fixed in a follow-up story or documented as "won't fix" with rationale
**And** the final a11y score is ≥ 95/100 axe-core threshold.
