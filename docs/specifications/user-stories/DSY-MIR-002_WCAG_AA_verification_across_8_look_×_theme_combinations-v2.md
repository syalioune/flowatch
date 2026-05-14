# DSY-MIR-002: WCAG AA verification across 8 look × theme combinations

> **User Story ID**: DSY-MIR-002
> **Persona**: MIR
> **Epic**: 17 — Design System — three looks × themes × densities
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 17.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dsy, release:0.0.2


As Mira (operator with accessibility needs), I want all 8 look × theme combinations to meet WCAG AA contrast, so that the UI is legible in every variant. Per NFR-16.

**Acceptance Criteria:**

**Given** the design system has 8 combinations (3 looks × 2 themes, with shared density tokens)
**When** a manual audit pass evaluates `--fg` on `--bg`, `--fg-soft` on `--bg`, `--fg-mute` on `--bg`, and `--accent-fg` on `--accent` for every combination
**Then** every pair meets WCAG AA contrast (4.5:1 minimum for body text, 3:1 for large text)
**And** any failing pair is documented in `docs/a11y-audit-2026-MM.md` with a fix plan
**And** an open issue is filed for any fix not done in this story (and tagged `area:design-system`, `area:tests`).
