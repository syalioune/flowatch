# FND-SYS-002: Add `e2e` job with Docker Compose Flowable

> **User Story ID**: FND-SYS-002
> **Persona**: SYS
> **Epic**: 4 — CI/CD Foundation (GitHub Actions)
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 4.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As CI, I want Playwright E2E to run against a Dockerized Flowable on every PR, so that regressions in the Flowable REST contract or Flowatch's wrappers surface before merge.

**Acceptance Criteria:**

**Given** Playwright is wired (Story 2.3)
**When** `.github/workflows/ci.yml` includes an `e2e` job that runs `docker compose up -d`, waits for engine readiness, runs Playwright, and uploads the report as an artifact on failure
**Then** the job passes when Story 2.3's golden-path test passes
**And** the job runs in ≤ 5 minutes (target — Flowable cold-start is ~30s of that)
**And** Pattern P-009 (live-API only) is honored — no mocks.
