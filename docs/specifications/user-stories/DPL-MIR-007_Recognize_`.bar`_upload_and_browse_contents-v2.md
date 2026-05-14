# DPL-MIR-007: Recognize `.bar` upload and browse contents

> **User Story ID**: DPL-MIR-007
> **Persona**: MIR
> **Epic**: 25 — App-Definition Browse + `.bar` Upload Recognition
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 25.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.3


As Mira, I want Flowatch to recognize a `.bar` (Flowable App archive) upload, list its bundled processes/forms/decisions, and surface a unified view, so that I can see what an app deployment contains. Per FR-55 (scope-reduced).

**Acceptance Criteria:**

**Given** the user uploads a `.bar` (or `.zip`) file on the Deployments screen
**When** Flowatch detects the file extension and calls `api.listAppDefinitions()` from `/app-api/app-repository/app-definitions` after the deploy
**Then** the resulting app deployment's contained artifacts are listed (BPMN process keys, DMN decision keys, form keys)
**And** clicking an artifact navigates to its detail
**And** the "runtime side" (running app-instances) is NOT exposed (per compat.md FR-55 scope reduction — documented as out of scope on the screen).
