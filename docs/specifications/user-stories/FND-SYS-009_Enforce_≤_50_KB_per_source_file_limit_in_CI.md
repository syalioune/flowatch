# FND-SYS-009: Enforce ≤ 50 KB per source file limit in CI

> **User Story ID**: FND-SYS-009
> **Persona**: SYS
> **Epic**: 5 — Release Pipeline Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 5.5)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As a maintainer, I want CI to block any source file exceeding 50 KB, so that the codebase stays navigable per NFR-21.

**Acceptance Criteria:**

**Given** `scripts/ci/check-file-size.sh` enumerates every `.ts`, `.tsx`, `.css` file under `src/`
**When** the script reports any file > 50 KB (51,200 bytes)
**Then** CI's `check` job fails with the offending path + size
**And** the check excludes `src/styles/tokens.css` only if it has a documented exemption comment (`/* size-exempt: design-token table */`) — every other file is enforced
**And** the script's threshold is configurable via env var (`MAX_SOURCE_FILE_BYTES`) so it can be temporarily relaxed in an emergency hotfix.

---
