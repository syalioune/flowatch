# QGT-SYS-004: Migrate remaining `src/` files to TypeScript

> **User Story ID**: QGT-SYS-004
> **Persona**: SYS
> **Epic**: 1 — TypeScript + Biome Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 1.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:qgt, release:0.0.1


As a maintainer, I want every source file under `src/` to be `.ts` or `.tsx`, so that the project is fully type-checked end-to-end. Per ADR-001.

**Acceptance Criteria:**

**Given** `src/api.ts` already migrated
**When** every other file in `src/` is renamed to `.tsx` or `.ts` (components.tsx, screens.tsx, modeler.tsx, tweaks-panel.tsx, etc.) and types are added for component props, `useApi` hook return shape, `Flowable*` REST DTOs
**Then** `npx tsc --noEmit` passes cleanly with no `any` outside explicit migration markers
**And** `npx biome check src/` passes
**And** the migration markers (where `any` is intentionally accepted) reference an open issue for tightening.

---
