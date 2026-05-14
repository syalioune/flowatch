# FND-SYS-008: Add Apache 2.0 SPDX headers to all new source files

> **User Story ID**: FND-SYS-008
> **Persona**: SYS
> **Epic**: 5 — Release Pipeline Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 5.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As a maintainer, I want every new source file under `src/` to start with an SPDX-License-Identifier header, so that license provenance is auditable per NFR-28.

**Acceptance Criteria:**

**Given** the repo is Apache 2.0 licensed (LICENSE file exists)
**When** every `.ts`, `.tsx`, `.css`, `.html` file under `src/` and `branding/` gets a top comment `// SPDX-License-Identifier: Apache-2.0` (or `/* … */` for CSS)
**Then** a CI grep check (`scripts/ci/check-spdx.sh`) passes
**And** the check is added to the `check` job in `.github/workflows/ci.yml`.

---
