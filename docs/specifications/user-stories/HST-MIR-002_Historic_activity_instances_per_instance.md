# HST-MIR-002: Historic activity instances per instance

> **User Story ID**: HST-MIR-002
> **Persona**: MIR
> **Epic**: 13 — History (audit trail)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 13.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:hst, release:0.0.2


As Mira, I want to see the audit trail of which activities ran for a specific instance, in order, so that I can trace what happened. Per FR-28.

**Acceptance Criteria:**

**Given** the user is on an instance detail page
**When** they switch to the History tab (or the History section of the detail page)
**Then** `api.listHistoricActivities({processInstanceId: id, size:200})` is called
**And** each activity is listed with type, name, started, ended, duration, assignee (if applicable)
**And** the list is sorted by start time ascending.
