# RUN-MIR-008: Delegate and resolve task actions

> **User Story ID**: RUN-MIR-008
> **Persona**: MIR
> **Epic**: 11 — Tasks + Task Forms
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 11.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want `Delegate` and `Resolve` actions in addition to claim/complete, so that I can hand off a task or mark it done after a delegation. Per FR-21.

**Acceptance Criteria:**

**Given** a task is open on `/tasks/:id`
**When** the user picks `Delegate` and enters a target user
**Then** `api.taskAction(taskId, 'delegate', { assignee: target })` is called
**And** when the user picks `Resolve` on a delegated task back to themselves
**Then** `api.taskAction(taskId, 'resolve')` is called
**And** the engine's response state is reflected in the task row immediately.
