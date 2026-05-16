# RUN-MIR-015: Install form-js and render task forms via it

> **User Story ID**: RUN-MIR-015
> **Persona**: MIR
> **Epic**: 29 — Forms Designer & Standalone Form Rendering
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 29.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:1.0.0


As Mira, I want task forms rendered by the modern form-js renderer (instead of the legacy `/form/form-data` body shape), so that the form UI is consistent with the rest of Flowatch. Per FR-23, FR-51 (scope-reduced).

**Acceptance Criteria:**

**Given** `@bpmn-io/form-js-viewer` is installed
**When** a task with a form-js form definition is opened on `/tasks/:id`
**Then** the form-js viewer renders the form with its native styling overridden by Flowatch's `data-look` system
**And** submitting the form calls `api.submitTaskForm(taskId, properties)` with the form-js output structure
**And** when a task references a legacy form (no form-js definition — the engine returns the `/form/form-data` body shape from Story 11.3), the legacy renderer is used as a fallback (per PRD FR-23 — "the legacy form-data renderer MUST remain available as a fallback"); the choice is made by detecting whether the form payload contains a `components` array (form-js) or a `formProperties` array (legacy).
