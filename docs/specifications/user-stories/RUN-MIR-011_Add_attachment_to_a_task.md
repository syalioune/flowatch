# RUN-MIR-011: Add attachment to a task

> **User Story ID**: RUN-MIR-011
> **Persona**: MIR
> **Epic**: 21 — Task Edit + Attachments
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 21.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.3


As Mira, I want to attach a file or URL to a task, so that I can document context. Per FR-45.

**Acceptance Criteria:**

**Given** a task detail page
**When** the user clicks "Add attachment", picks file or enters URL, saves
**Then** `api.addTaskAttachment(taskId, { name, type, url|content })` is called (POST to `/runtime/tasks/{id}/attachments`)
**And** the attachment appears in the task's attachment list.
