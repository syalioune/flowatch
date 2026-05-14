# IDT-MIR-005: Update + delete user

> **User Story ID**: IDT-MIR-005
> **Persona**: MIR
> **Epic**: 22 — User & Group Lifecycle (Admin)
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 22.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.3


As Mira, I want to edit a user's name/email and delete them, so that I can manage the directory.

**Acceptance Criteria:**

**Given** a user detail page
**When** the user clicks "Edit user", changes fields, saves
**Then** `api.updateUser(id, fields)` is called (PUT)
**And** clicking "Delete user" + confirming calls `api.deleteUser(id)`
**And** both operations reflect immediately in the list.
