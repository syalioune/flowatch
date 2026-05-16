# RUN-MIR-004: Read instance variables on detail page

> **User Story ID**: RUN-MIR-004
> **Persona**: MIR
> **Epic**: 10 — Process Instances Runtime
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 10.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want to see the variables a running process instance carries (name, type, scope, value), so that I can understand the state the workflow is operating on — and so that the variable-edit flow (Story 19.1, 19.2) has a list to act against. Per FR-18.

**Acceptance Criteria:**

**Given** the user navigates to `/instances/:id` (instance detail page)
**When** the route loader calls `api.listInstanceVariables(id)` against `GET /runtime/process-instances/{id}/variables`
**Then** the page renders a Variables panel with columns: name (mono), type (badge — `string` / `boolean` / `integer` / `double` / `json` / `null`), scope (`global` / `local`), value (mono, JSON-pretty-printed when type is `json`)
**And** the four canonical states render per Pattern P-002 (loading skeleton → ErrorBox with verbatim engine message → "No variables." empty → table)
**And** the row actions column has an `Edit` action wired to Story 19.1's edit modal in milestone 0.0.3 (in 0.0.2 the action is a placeholder rendering "available in 0.0.3" tooltip)
**And** the API Inspector logs the call via Pattern P-001.

---
