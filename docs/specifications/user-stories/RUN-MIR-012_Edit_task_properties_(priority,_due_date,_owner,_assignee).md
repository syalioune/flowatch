# RUN-MIR-012: Edit task properties (priority, due date, owner, assignee)

> **User Story ID**: RUN-MIR-012
> **Persona**: MIR
> **Epic**: 21 — Task Edit + Attachments
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 21.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.3


As Mira, I want to edit a task's priority, due date, owner, and assignee from the task detail page, so that I can adjust scheduling without canceling and recreating. Per FR-44.

**Acceptance Criteria:**

**Given** a task detail page
**When** the user clicks "Edit task", changes priority / due date / owner / assignee, saves
**Then** `api.updateTask(id, fields)` is called (PUT with the task body)
**And** the task row reflects the changes in the list.
