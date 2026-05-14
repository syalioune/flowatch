# HST-MIR-001: Historic process instances list

> **User Story ID**: HST-MIR-001
> **Persona**: MIR
> **Epic**: 13 — History (audit trail)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 13.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:hst, release:0.0.2


As Mira, I want a list of completed/ended process instances, so that I can audit past work. Per FR-28.

**Acceptance Criteria:**

**Given** the user navigates to `/history?type=instances`
**When** the route loader calls `api.listHistoricInstances({size:50, sort:'endTime', order:'desc'})`
**Then** each row shows id, definition key, started, ended, duration (`fmtMs`)
**And** clicking a row navigates to `/instances/:id` (which shows historic + runtime in a unified detail view).
