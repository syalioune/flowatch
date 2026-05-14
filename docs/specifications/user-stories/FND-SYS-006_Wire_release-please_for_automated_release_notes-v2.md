# FND-SYS-006: Wire release-please for automated release notes

> **User Story ID**: FND-SYS-006
> **Persona**: SYS
> **Epic**: 5 — Release Pipeline Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 5.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As a maintainer, I want release-please to generate release notes and version bumps from Conventional Commits on every push to main, so that I never hand-write a CHANGELOG. Per NFR-25.

**Acceptance Criteria:**

**Given** `release.config.mjs` is configured with Flowatch themes (existing)
**When** `.github/workflows/release-please.yml` is added running `googleapis/release-please-action@<pinned-sha>` against `main`
**Then** a `feat: …` commit on main produces a release-PR with a draft CHANGELOG.md entry
**And** merging the release-PR creates a tag + GitHub Release with the auto-generated notes
**And** the notes use the theme structure from release.config.mjs (Modelers, Runtime, etc.).
