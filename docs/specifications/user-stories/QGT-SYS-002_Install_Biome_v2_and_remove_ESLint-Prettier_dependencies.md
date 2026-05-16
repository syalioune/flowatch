# QGT-SYS-002: Install Biome v2 and remove ESLint/Prettier dependencies

> **User Story ID**: QGT-SYS-002
> **Persona**: SYS
> **Epic**: 1 — TypeScript + Biome Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 1.2)
> **State**: done
> **Labels**: type:user-story, state:done, area:qgt, release:0.0.1


As CI, I want Biome v2 to be the only lint+format tool, so that the toolchain has one binary and one config file. Per ADR-007 and PRD FR-F2.

**Acceptance Criteria:**

**Given** the project may have legacy ESLint or Prettier configs
**When** `@biomejs/biome` is installed, `biome.json` is added at repo root, and any `.eslintrc*` / `.prettierrc*` files are removed
**Then** `npx biome ci` passes on the migrated `src/api.ts`
**And** the `package.json` has scripts `lint`, `format`, `check` wrapping Biome
**And** ESLint and Prettier packages are absent from `package.json` and `package-lock.json`.
