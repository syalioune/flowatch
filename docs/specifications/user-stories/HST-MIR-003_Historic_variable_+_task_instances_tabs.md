# HST-MIR-003: Historic variable + task instances tabs

> **User Story ID**: HST-MIR-003
> **Persona**: MIR
> **Epic**: 13 — History (audit trail)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 13.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:hst, release:0.0.2


As Mira, I want to see variable changes and tasks across history for a given instance, so that I can audit what data flowed and who acted. Per FR-28.

**Acceptance Criteria:**

**Given** the user is on `/history?type=variables` or `/history?type=tasks`
**When** the route loader calls the corresponding wrapper (`listHistoricVariables`, `listHistoricTasks`)
**Then** rows show variable/task with their context (instance id, name, value/type for variables; assignee/completion for tasks)
**And** filtering by `processInstanceId` is supported via search param.
