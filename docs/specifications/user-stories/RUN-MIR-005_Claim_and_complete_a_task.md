# RUN-MIR-005: Claim and complete a task

> **User Story ID**: RUN-MIR-005
> **Persona**: MIR
> **Epic**: 11 — Tasks + Task Forms
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 11.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want to claim an unassigned task and complete it with one click each, so that I can work through my queue. Per FR-21.

**Acceptance Criteria:**

**Given** an unassigned task is listed
**When** the user clicks `Claim`
**Then** `api.taskAction(taskId, 'claim', { assignee: currentUser })` is called and the task moves into the user's queue (refresh)
**And** clicking `Complete` calls `api.taskAction(taskId, 'complete')` and the task disappears from the active list
**And** failures surface as error toasts with verbatim engine message.
