# RUN-MIR-009: Add and delete a variable

> **User Story ID**: RUN-MIR-009
> **Persona**: MIR
> **Epic**: 19 — Variable Edit on Running Instances
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 19.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.3


As Mira, I want to add a new variable to a running instance (or delete one), so that I can patch in missing state.

**Acceptance Criteria:**

**Given** the variables list on instance detail
**When** the user clicks "Add variable", enters name + value + type
**Then** the same PUT endpoint is called to add it
**And** clicking "Delete" on a variable row calls `DELETE /runtime/process-instances/{id}/variables/{name}`
**And** both operations reload the list.
