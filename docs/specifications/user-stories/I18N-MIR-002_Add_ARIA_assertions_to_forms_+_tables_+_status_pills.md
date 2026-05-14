# I18N-MIR-002: Add ARIA assertions to forms + tables + status pills

> **User Story ID**: I18N-MIR-002
> **Persona**: MIR
> **Epic**: 18 — Accessibility + Snapshot Coverage
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 18.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:i18n, release:0.0.2


As a screen-reader user, I want every interactive element to have appropriate ARIA, so that I can navigate the app via assistive technology. Per NFR-17.

**Acceptance Criteria:**

**Given** Playwright is wired
**When** `e2e/a11y/aria.spec.ts` asserts: icon-only buttons have `aria-label`, tables use `<th scope="col">` + `aria-sort`, status pills include screen-reader-only context ("Status: active"), modals have `role="dialog"` + `aria-labelledby`
**Then** the test passes on every screen with such elements.
