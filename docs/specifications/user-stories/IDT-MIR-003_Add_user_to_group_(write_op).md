# IDT-MIR-003: Add user to group (write op)

> **User Story ID**: IDT-MIR-003
> **Persona**: MIR
> **Epic**: 14 — Identity (users + groups) + Tenants
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 14.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.2


As Mira, I want to grant a user membership in a group from the Identity screen, so that I don't have to use curl for membership management. Per FR-30.

**Acceptance Criteria:**

**Given** a user detail or group detail page exists
**When** the user clicks "Add to group" and picks a target group (or "Add user" on a group and picks a user)
**Then** `api.addUserToGroup(userId, groupId)` is called
**And** on success, the group/user appears in the list immediately + toast confirms.
