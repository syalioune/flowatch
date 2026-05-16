# RUN-MIR-009: Unclaim a task

> **User Story ID**: RUN-MIR-009
> **Persona**: MIR
> **Epic**: 11 — Tasks + Task Forms
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 11.5)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want an `Unclaim` action on a task I've previously claimed, so that I can release it back to the unassigned queue when I realize someone else should handle it. Per FR-21 (completes the 5-action enumeration: claim / complete / delegate / resolve / **unclaim**).

**Acceptance Criteria:**

**Given** the user has a claimed task on `/tasks/:id` (current assignee = current user)
**When** the user picks `Unclaim` from the task action menu
**Then** `api.taskAction(taskId, 'unclaim')` is called (`/runtime/tasks/{id}` with body `{action: 'unclaim'}`)
**And** on success, the task assignee clears and the task disappears from the user's queue (refresh `/tasks?assignee=me`)
**And** the action is only visible when the task is currently assigned to the requesting user (no unclaim option for tasks assigned to others).

---
