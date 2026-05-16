# QGT-SYS-006: Wire Vitest browser mode with Playwright provider for component tests

> **User Story ID**: QGT-SYS-006
> **Persona**: SYS
> **Epic**: 2 — Vitest + Playwright Test Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 2.2)
> **State**: done
> **Labels**: type:user-story, state:done, area:qgt, release:0.0.1


As a maintainer, I want component tests to run in real Chromium so that `window`, `localStorage`, `IntersectionObserver`, and DOM events behave as they will in production.

**Acceptance Criteria:**

**Given** Vitest unit tier is wired (Story 2.1)
**When** `@vitest/browser` + `@playwright/test` are installed and `vitest.workspace.ts` configures a separate browser project pointing at the Playwright provider, with one example component test (e.g. `<ErrorBox>`) under `src/components/__tests__/ErrorBox.spec.tsx`
**Then** `npx vitest --workspace=vitest.workspace.ts run` passes both projects
**And** the example test asserts a real DOM-rendered error message matching the verbatim engine response.
