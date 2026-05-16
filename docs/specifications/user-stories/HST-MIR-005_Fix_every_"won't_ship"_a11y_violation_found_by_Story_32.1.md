# HST-MIR-005: Fix every "won't ship" a11y violation found by Story 32.1

> **User Story ID**: HST-MIR-005
> **Persona**: MIR
> **Epic**: 32 — Full Accessibility Audit
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 32.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:hst, release:1.0.0


As Mira, I want every blocking a11y issue from the audit fixed before 1.0 ships, so that I can use Flowatch with a screen reader or keyboard.

**Acceptance Criteria:**

**Given** the audit report from Story 32.1
**When** every "won't ship" violation has a corresponding fix in the codebase
**Then** re-running the audit produces zero blocking violations
**And** the score is ≥ 98/100.
