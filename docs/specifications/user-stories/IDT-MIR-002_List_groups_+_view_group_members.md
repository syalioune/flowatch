# IDT-MIR-002: List groups + view group members

> **User Story ID**: IDT-MIR-002
> **Persona**: MIR
> **Epic**: 14 — Identity (users + groups) + Tenants
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 14.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.2


As Mira, I want to see all groups and (per-group) the users who belong, so that I can audit access.

**Acceptance Criteria:**

**Given** the user navigates to `/identity` with the "Groups" tab
**When** the route loader calls `api.listGroups({size:50})`
**Then** each group row shows id, name, type
**And** clicking a group navigates to `/identity/groups/:id` which lists the members.
