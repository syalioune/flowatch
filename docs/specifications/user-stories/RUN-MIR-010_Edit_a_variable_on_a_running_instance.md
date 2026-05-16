# RUN-MIR-010: Edit a variable on a running instance

> **User Story ID**: RUN-MIR-010
> **Persona**: MIR
> **Epic**: 19 — Variable Edit on Running Instances
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 19.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.3


As Mira, I want to edit a variable's value on a running instance (e.g. unstick a workflow waiting on a wrong input), so that I can recover without restarting the process. Per FR-19.

**Acceptance Criteria:**

**Given** an instance detail page shows the variables list
**When** the user clicks "Edit" on a variable row, changes the value, picks a type, and saves
**Then** `api.updateInstanceVariables(instanceId, [{name, value, type, scope: 'local'}])` is called (PUT with array body — verified live in compat.md)
**And** on success, the variables list reloads and reflects the change
**And** the API Inspector logs the call.
