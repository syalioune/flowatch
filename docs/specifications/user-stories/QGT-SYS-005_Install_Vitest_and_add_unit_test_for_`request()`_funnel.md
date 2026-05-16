# QGT-SYS-005: Install Vitest and add unit test for `request()` funnel

> **User Story ID**: QGT-SYS-005
> **Persona**: SYS
> **Epic**: 2 — Vitest + Playwright Test Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 2.1)
> **State**: done
> **Labels**: type:user-story, state:done, area:qgt, release:0.0.1


As CI, I want Vitest to run unit tests on every push, so that regressions to the request funnel are caught immediately.

**Acceptance Criteria:**

**Given** Vitest is not yet installed
**When** `vitest` + `@testing-library/react` + `@testing-library/jest-dom` are installed, `vitest.config.ts` is added, and `src/api/__tests__/request.test.ts` covers the `request()` success path, 4xx error path, and 5xx error path (using a real fetch-mock at the HTTP level — no `vi.mock(api)`)
**Then** `npx vitest run` passes
**And** coverage for `src/api/client.ts` is ≥ 70% per the threshold set in `vitest.config.ts`
**And** Pattern P-001 is referenced in the test file (the funnel rule).
