# INS-SYS-001: Pattern P-001 enforcement — Biome rule forbidding `fetch()` outside `src/api/`

> **User Story ID**: INS-SYS-001
> **Persona**: SYS
> **Epic**: 8 — API Inspector — observability differentiator
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 8.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:ins, release:0.0.2


As CI, I want a lint rule that fails the build if any file outside `src/api/client.ts` calls `fetch()` directly, so that Pattern P-001 is mechanically enforced.

**Acceptance Criteria:**

**Given** Biome is wired (Epic 1)
**When** `biome.json` adds a custom rule (or a grep-based pre-commit/CI script `scripts/ci/check-fetch-funnel.sh`) that fails when `\bfetch\(` appears outside `src/api/client.ts`
**Then** `npx biome check` fails on a file outside `src/api/` that uses `fetch()`
**And** the CI `check` job picks up the failure
**And** the rule is documented in CONTRIBUTING.md (Pattern P-001 enforcement).

---
