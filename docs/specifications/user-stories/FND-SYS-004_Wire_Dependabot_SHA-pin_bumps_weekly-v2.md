# FND-SYS-004: Wire Dependabot SHA-pin bumps weekly

> **User Story ID**: FND-SYS-004
> **Persona**: SYS
> **Epic**: 4 — CI/CD Foundation (GitHub Actions)
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 4.5)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As a maintainer, I want Dependabot to bump SHA-pinned GitHub Actions weekly, so that the supply chain stays current without manual sweeps. Per NFR-26.

**Acceptance Criteria:**

**Given** `.github/dependabot.yml` is already configured for github-actions / npm / docker
**When** workflow files use commit-SHA pins (e.g. `actions/checkout@abc123...`)
**Then** Dependabot opens weekly PRs bumping the SHAs
**And** the PRs are labeled `area:ci-cd` per the dependabot config
**And** existing tests + check jobs gate the bump PRs.

---
