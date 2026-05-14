# RUN-MIR-014: Form-js designer mode for authoring forms

> **User Story ID**: RUN-MIR-014
> **Persona**: MIR
> **Epic**: 29 — Forms Designer & Standalone Form Rendering
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 29.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:1.0.0


As Mira (form author), I want a designer mode where I can drag form components onto a canvas and save, so that I can author forms without writing JSON. Per FR-23.

**Acceptance Criteria:**

**Given** `@bpmn-io/form-js-editor` is installed
**When** the user navigates to `/forms/new` or `/forms/:id/edit`, the editor mounts
**Then** the user can drag input/textarea/select/radio/checkbox/number/datetime components
**And** Save exports the form-js JSON
**And** the form is stored either inline in the BPMN (via `extensionElements`) or in the (future) form-api if the operator runs `flowable-ui`-style deployment (out of scope per compat.md).
