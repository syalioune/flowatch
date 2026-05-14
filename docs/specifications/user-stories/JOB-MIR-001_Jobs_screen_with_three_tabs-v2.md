# JOB-MIR-001: Jobs screen with three tabs

> **User Story ID**: JOB-MIR-001
> **Persona**: MIR
> **Epic**: 12 — Jobs (executable / timer / dead-letter)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 12.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:job, release:0.0.2


As Mira, I want a Jobs screen split into Executable / Timer / Dead-letter tabs, so that I can find failing jobs without digging through all jobs. Per FR-24.

**Acceptance Criteria:**

**Given** the user navigates to `/jobs?type=executable`
**When** the route loader calls `api.listJobs({size:50, withException: type === 'executable'})`
**Then** the tab shows the right list with id, retries, exception flag (badge), due date
**And** clicking `?type=timer` calls `api.listTimerJobs(...)`
**And** clicking `?type=deadletter` calls `api.listDeadLetterJobs(...)`
**And** the tab selection is in the URL search param (deep-linkable).
