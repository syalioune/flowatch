# FND-SYS-001: Add `check` and `unit` GitHub Actions jobs

> **User Story ID**: FND-SYS-001
> **Persona**: SYS
> **Epic**: 4 — CI/CD Foundation (GitHub Actions)
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 4.1)
> **State**: done
> **Labels**: type:user-story, state:done, area:fnd, release:0.0.1


As CI, I want `biome ci` + `tsc --noEmit` + `vitest run` to run on every PR, so that style/type/unit-test regressions block merge.

**Acceptance Criteria:**

**Given** Biome + Vitest are wired (Epics 1+2)
**When** `.github/workflows/ci.yml` is added with `check` job (Biome ci + tsc --noEmit) and `unit` job (vitest run) configured to run on `push` and `pull_request`
**Then** opening a PR triggers both jobs
**And** both jobs are listed in `.github/protection/required_checks.json`
**And** all GitHub Actions versions are SHA-pinned per NFR-26.
