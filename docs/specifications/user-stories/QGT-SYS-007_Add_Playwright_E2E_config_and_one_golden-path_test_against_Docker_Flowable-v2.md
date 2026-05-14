# QGT-SYS-007: Add Playwright E2E config and one golden-path test against Docker Flowable

> **User Story ID**: QGT-SYS-007
> **Persona**: SYS
> **Epic**: 2 — Vitest + Playwright Test Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 2.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:qgt, release:0.0.1


As CI, I want one Playwright E2E test that exercises the full operator path (deploy BPMN → start instance → claim task → complete task → check history) against a Dockerized `flowable-rest:7.2.0`, so that any regression in the Flowable REST contract surfaces in CI.

**Acceptance Criteria:**

**Given** the Docker Compose stack is defined (existing `docker-compose.yml`)
**When** `playwright.config.ts` is added with a `webServer` block that starts `docker compose up -d` + waits for `/management/engine` to return 200, and `e2e/golden-path.spec.ts` walks the deploy → start → claim → complete → history flow
**Then** `npx playwright test` exits 0 with the test passing
**And** the test uses real Flowable, no mocks (Pattern P-009)
**And** Docker teardown happens in the `webServer.gracefulShutdown` config.
