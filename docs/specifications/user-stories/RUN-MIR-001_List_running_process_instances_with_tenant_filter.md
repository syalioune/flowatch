# RUN-MIR-001: List running process instances with tenant filter

> **User Story ID**: RUN-MIR-001
> **Persona**: MIR
> **Epic**: 10 — Process Instances Runtime
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 10.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want to see all running instances of all definitions, sorted by start time descending, so that I can spot what's active and triage. Per FR-15.

**Acceptance Criteria:**

**Given** the user navigates to `/instances`
**When** the route loader calls `api.listProcessInstances({size:50, sort:'startTime', order:'desc', tenantId})`
**Then** each row shows id (mono), definition key, started (`fmtTime`), state (active / suspended / ended badge), business key
**And** four canonical states render per Pattern P-002
**And** clicking a row navigates to `/instances/:id`.
