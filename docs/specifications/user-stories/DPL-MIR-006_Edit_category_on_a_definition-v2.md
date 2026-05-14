# DPL-MIR-006: Edit category on a definition

> **User Story ID**: DPL-MIR-006
> **Persona**: MIR
> **Epic**: 20 — Process Definition Category Edit
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 20.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.3


As Mira, I want to edit a process definition's category (organizational tag) so that I can group related definitions. Per FR-43 (verified live in compat.md).

**Acceptance Criteria:**

**Given** a definition detail page
**When** the user clicks "Edit category", enters a new category value, saves
**Then** `api.updateDefinition(id, { category })` is called (PUT with `{category}` body)
**And** the new category appears in the definition list (refresh).
