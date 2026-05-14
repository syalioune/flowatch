# JOB-MIR-003: Move dead-letter job back to executable

> **User Story ID**: JOB-MIR-003
> **Persona**: MIR
> **Epic**: 12 — Jobs (executable / timer / dead-letter)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 12.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:job, release:0.0.2


As Mira, I want to retry a dead-letter job by moving it back to the executable queue, so that I can recover after fixing the root cause. Per FR-26.

**Acceptance Criteria:**

**Given** a dead-letter job is listed on `/jobs?type=deadletter`
**When** the user clicks `Move to executable`
**Then** `api.moveDeadLetterJob(jobId)` is called
**And** on success, the job leaves the dead-letter tab and appears in the executable tab on refresh.
