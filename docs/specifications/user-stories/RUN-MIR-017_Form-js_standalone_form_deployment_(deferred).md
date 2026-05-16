# RUN-MIR-017: Form-js standalone form deployment (deferred)

> **User Story ID**: RUN-MIR-017
> **Persona**: MIR
> **Epic**: 29 — Forms Designer & Standalone Form Rendering
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 29.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:1.0.0


As Mira, I want standalone form definitions deployable to Flowable's form engine, so that the same form is reusable across tasks. Per FR-51 (deferred).

**Acceptance Criteria:**

**Given** `/form-api/*` is NOT exposed in `flowable-rest:7.2.0` (per compat.md)
**When** this story is scheduled
**Then** the implementation gates on the operator using an alternate Flowable image (e.g. `flowable-ui`) that exposes `/form-api/`
**And** if `/form-api/` returns 404, the standalone-form UI is hidden and an explainer is shown.
