# QGT-SYS-003: Wire pre-commit Biome formatter via Husky

> **User Story ID**: QGT-SYS-003
> **Persona**: SYS
> **Epic**: 1 — TypeScript + Biome Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 1.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:qgt, release:0.0.1


As a contributor, I want Biome to auto-format my staged files on commit, so that I don't have to remember to run it manually.

**Acceptance Criteria:**

**Given** Husky and the `.husky/pre-commit` hook are already wired (from the imported tooling)
**When** Biome is installed and I run a `git commit` with formatting violations
**Then** the hook runs `npx biome format --write` against the staged files
**And** the corrected files are re-staged automatically
**And** the commit succeeds with no manual intervention.
