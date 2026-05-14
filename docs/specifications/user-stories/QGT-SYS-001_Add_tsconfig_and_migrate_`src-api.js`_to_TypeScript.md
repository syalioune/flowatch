# QGT-SYS-001: Add tsconfig and migrate `src/api.js` to TypeScript

> **User Story ID**: QGT-SYS-001
> **Persona**: SYS
> **Epic**: 1 — TypeScript + Biome Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 1.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:qgt, release:0.0.1


As CI, I want the project to have a `tsconfig.json` extending `@tsconfig/vite-react` with strict mode on, so that subsequent files migrate one at a time with type-checking enforcement.

**Acceptance Criteria:**

**Given** the project currently uses plain `.jsx`/`.js`
**When** `tsconfig.json` is added with `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, and `src/api.js` is renamed to `src/api.ts` with types for the Flowable response envelopes
**Then** `npx tsc --noEmit` exits 0 across the project
**And** the `request()` function has typed signatures for HTTP method, path, options, and return value
**And** ADR-001 and Pattern P-001 are referenced in the file's top-level comment.
