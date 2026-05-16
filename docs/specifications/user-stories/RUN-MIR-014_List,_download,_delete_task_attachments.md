# RUN-MIR-014: List, download, delete task attachments

> **User Story ID**: RUN-MIR-014
> **Persona**: MIR
> **Epic**: 21 — Task Edit + Attachments
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 21.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.3


As Mira, I want to see, download, and delete attachments on a task, so that I can manage task evidence.

**Acceptance Criteria:**

**Given** a task with attachments
**When** the user opens the Attachments panel
**Then** `api.listTaskAttachments(taskId)` is called and renders the list
**And** clicking download fetches and saves the file (binary or text)
**And** clicking delete + confirming calls `api.deleteTaskAttachment(taskId, attachmentId)`.
