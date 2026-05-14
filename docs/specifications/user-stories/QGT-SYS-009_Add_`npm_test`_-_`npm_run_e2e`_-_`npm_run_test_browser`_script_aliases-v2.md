# QGT-SYS-009: Add `npm test` / `npm run e2e` / `npm run test:browser` script aliases

> **User Story ID**: QGT-SYS-009
> **Persona**: SYS
> **Epic**: 2 — Vitest + Playwright Test Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 2.5)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:qgt, release:0.0.1


As a contributor, I want one-line npm scripts for each test tier, so that I don't have to remember which Vitest project flag is which.

**Acceptance Criteria:**

**Given** Vitest + Playwright are installed
**When** `package.json` is updated with scripts `test` (Vitest unit), `test:browser` (Vitest browser mode), `e2e` (Playwright), `test:all` (everything in sequence)
**Then** each script runs the expected tier and reports a clear exit code
**And** the scripts are documented in DEVELOPERS.md §5.

---
