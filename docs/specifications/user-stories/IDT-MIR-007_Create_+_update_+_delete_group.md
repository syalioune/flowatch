# IDT-MIR-007: Create + update + delete group

> **User Story ID**: IDT-MIR-007
> **Persona**: MIR
> **Epic**: 22 — User & Group Lifecycle (Admin)
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 22.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.3


As Mira, I want full CRUD on groups, so that I can manage role-equivalent collections. Per FR-47.

**Acceptance Criteria:**

**Given** the user is on `/identity` Groups tab
**When** they create/edit/delete groups via the analogous flows to user CRUD
**Then** each operation calls the right `api.*Group` wrapper
**And** the groups list updates immediately on each operation.
