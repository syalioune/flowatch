# IDT-MIR-001: List users with pagination

> **User Story ID**: IDT-MIR-001
> **Persona**: MIR
> **Epic**: 14 — Identity (users + groups) + Tenants
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 14.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.2


As Mira, I want a list of all Flowable users with their basic info, so that I can see who can access the system. Per FR-30.

**Acceptance Criteria:**

**Given** the user navigates to `/identity`
**When** the route loader calls `api.listUsers({size:50})`
**Then** each row shows id, first/last name, email, with action `View groups`
**And** four canonical states render per Pattern P-002.
