# JOB-MIR-002: Execute job on demand

> **User Story ID**: JOB-MIR-002
> **Persona**: MIR
> **Epic**: 12 — Jobs (executable / timer / dead-letter)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 12.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:job, release:0.0.2


As Mira, I want to manually execute a job (e.g. after a fix) so that I don't have to wait for the next async cycle. Per FR-25.

**Acceptance Criteria:**

**Given** a job is listed on `/jobs`
**When** the user clicks `Execute now`
**Then** `api.executeJob(jobId)` is called
**And** on success, the job disappears from the list (executed) — refresh
**And** on failure, an error toast surfaces with verbatim message.
