# I18N-MIR-001: Add keyboard-navigation Playwright assertions

> **User Story ID**: I18N-MIR-001
> **Persona**: MIR
> **Epic**: 18 — Accessibility + Snapshot Coverage
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 18.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:i18n, release:0.0.2


As Mira (keyboard user), I want every screen reachable and operable via keyboard only, so that I'm not blocked by missing focus management.

**Acceptance Criteria:**

**Given** every screen is routable (Epic 3)
**When** `e2e/a11y/keyboard.spec.ts` walks Tab through each screen and asserts: focus order matches visual order, no keyboard traps in modals, Escape closes modal/drawer/dropdown
**Then** the test passes on every screen
**And** focus ring is visible (CSS `:focus-visible` rule asserted via screenshot per Story 17.4).
