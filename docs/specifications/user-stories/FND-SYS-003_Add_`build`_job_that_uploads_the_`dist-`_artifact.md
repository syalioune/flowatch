# FND-SYS-003: Add `build` job that uploads the `dist/` artifact

> **User Story ID**: FND-SYS-003
> **Persona**: SYS
> **Epic**: 4 — CI/CD Foundation (GitHub Actions)
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 4.3)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As CI, I want a `build` job that runs `vite build` and uploads `dist/`, so that the `pages` job can deploy it and so that build failures are caught before merge.

**Acceptance Criteria:**

**Given** Biome + TS are wired
**When** `.github/workflows/ci.yml` includes a `build` job running `npm ci && npm run build` and uploading `dist/` via `actions/upload-artifact@<pinned-sha>`
**Then** every PR has the build artifact attached
**And** the build size is reported in the job summary
**And** the job is listed in `.github/protection/required_checks.json`.
