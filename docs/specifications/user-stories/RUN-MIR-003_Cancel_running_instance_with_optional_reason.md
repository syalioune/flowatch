# RUN-MIR-003: Cancel running instance with optional reason

> **User Story ID**: RUN-MIR-003
> **Persona**: MIR
> **Epic**: 10 — Process Instances Runtime
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 10.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want to cancel a running instance with an optional `deleteReason` so that the audit trail records why I stopped it. Per FR-17.

**Acceptance Criteria:**

**Given** an instance is visible on `/instances` or `/instances/:id`
**When** the user picks `Cancel` from the action menu, optionally types a delete reason, and confirms
**Then** `api.deleteProcessInstance(id, reason)` is called
**And** on success, the instance is marked ended in the list (reload) and a toast confirms
**And** the delete reason appears in the historic instance record (verified by `api.listHistoricInstances`).
