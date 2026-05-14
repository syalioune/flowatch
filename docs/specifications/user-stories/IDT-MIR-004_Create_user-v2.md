# IDT-MIR-004: Create user

> **User Story ID**: IDT-MIR-004
> **Persona**: MIR
> **Epic**: 22 — User & Group Lifecycle (Admin)
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 22.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.3


As Mira, I want to create a user from the Identity screen, so that I can provision access without using curl. Per FR-46.

**Acceptance Criteria:**

**Given** the user navigates to `/identity` and clicks "Create user"
**When** they fill the modal (id, first name, last name, email, password) and submit
**Then** `api.createUser({id, firstName, lastName, email, password})` is called (POST `/identity/users`)
**And** the new user appears in the users list (refresh)
**And** failures (e.g. duplicate id) surface as `ErrorBox` with verbatim engine message.
