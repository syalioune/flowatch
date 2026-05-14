# FND-SYS-007: Rewrite pre-existing commit history to Conventional Commits

> **User Story ID**: FND-SYS-007
> **Persona**: SYS
> **Epic**: 5 — Release Pipeline Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 5.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As a maintainer, I want every commit in the project's history to follow Conventional Commits, so that release-please can correctly compute version bumps from any range. Per project-context memory ("history WILL be rewritten") and NFR-24.

**Acceptance Criteria:**

**Given** existing commits use free-form lowercase messages (`add src/screens.jsx`, `add vite.config.js`, etc.)
**When** an interactive rebase from the initial commit rewrites each message into Conventional Commits format (e.g. `feat(screens): add screens.jsx`, `build(vite): add vite.config.js`)
**Then** `git log --pretty=%s` shows every commit conforms to the CC regex `^(feat|fix|chore|docs|refactor|test|ci|build|perf|style)(\([a-z0-9-]+\))?!?: .+`
**And** the rewrite is force-pushed to `main` (one-time, authorized by `force_push_next_commit.md` memory)
**And** the team is notified to re-clone (single-maintainer means just the maintainer).
