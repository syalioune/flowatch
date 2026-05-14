# FND-SYS-005: Install commitlint and wire `.husky/commit-msg` hook

> **User Story ID**: FND-SYS-005
> **Persona**: SYS
> **Epic**: 5 — Release Pipeline Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 5.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As CI, I want commit messages validated against Conventional Commits 1.0 before the commit is created, so that non-conforming commits are blocked at the hook level (not just at PR review).

**Acceptance Criteria:**

**Given** `.husky/commit-msg` exists (from the imported tooling) and invokes `npx commitlint --edit`
**When** `@commitlint/cli` + `@commitlint/config-conventional` are installed and `commitlint.config.cjs` is added at repo root with the scope vocabulary from `release.config.mjs` THEMES
**Then** running `git commit -m "feat: bad scope"` succeeds (valid CC)
**And** running `git commit -m "broken: bad type"` fails with a hook exit
**And** the new commitlint scopes match every theme in release.config.mjs (validated by `node scripts/release/check-scope.mjs`).
