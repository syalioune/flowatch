# RUN-MIR-007: Render task form via `/form/form-data`

> **User Story ID**: RUN-MIR-007
> **Persona**: MIR
> **Epic**: 11 — Tasks + Task Forms
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 11.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want to see the task's form when I open the task detail, so that I can fill it in instead of completing blindly. Per FR-22.

**Acceptance Criteria:**

**Given** a task with a form definition exists
**When** the user navigates to `/tasks/:id`
**Then** `api.getTaskForm(taskId)` is called and the form fields are rendered (input, select, textarea per the form data shape)
**And** submitting the form calls `api.submitTaskForm(taskId, properties)` which also completes the task
**And** validation errors from the engine surface inline in the form (using the engine's verbatim message).
