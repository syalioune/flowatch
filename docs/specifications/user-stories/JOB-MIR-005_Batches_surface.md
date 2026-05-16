# JOB-MIR-005: Batches surface

> **User Story ID**: JOB-MIR-005
> **Persona**: MIR
> **Epic**: 24 — Operations Visibility — Batches + Event Subscriptions
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 24.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:job, release:0.0.3


As Mira, I want a screen listing long-running batch operations with status and per-part failure detail, so that I can monitor bulk delete or bulk migration runs. Per FR-53.

**Acceptance Criteria:**

**Given** the user navigates to `/jobs?type=batches` (or a new `/batches` route)
**When** `api.listBatches({size:50})` is called against `/management/batches`
**Then** each row shows id, status, started, total parts, succeeded, failed
**And** clicking a row navigates to detail showing `/management/batches/{id}/batch-parts`.
