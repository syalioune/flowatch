# JOB-MIR-004: Inspect job exception stacktrace

> **User Story ID**: JOB-MIR-004
> **Persona**: MIR
> **Epic**: 12 — Jobs (executable / timer / dead-letter)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 12.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:job, release:0.0.2


As Mira, I want to see the verbatim stacktrace of a failed job, so that I can diagnose what went wrong without searching server logs. Per FR-27.

**Acceptance Criteria:**

**Given** a job with an exception is listed
**When** the user expands the job row or opens detail
**Then** `api.jobStacktrace(jobId)` is called with `raw: true` (text response)
**And** the stacktrace is rendered in a monospace `<pre>` block with copy-to-clipboard
**And** the stacktrace is shown verbatim (no truncation; reasonable scrollable area for long traces).

---
