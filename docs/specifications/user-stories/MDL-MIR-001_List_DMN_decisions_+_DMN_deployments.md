# MDL-MIR-001: List DMN decisions + DMN deployments

> **User Story ID**: MDL-MIR-001
> **Persona**: MIR
> **Epic**: 15 — DMN Decisions + Execution + History
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 15.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want to see all deployed decision tables/decisions, so that I can verify what business rules are live. Per FR-33.

**Acceptance Criteria:**

**Given** the user is on a DMN-aware screen (e.g. `/dmn` or under it)
**When** `api.listDecisions({size:50, base: dmnBase()})` is called per Pattern P-004
**Then** each row shows key, name, version, tenant
**And** the URL is `/dmn` (the modeler) — list panel could be a sidebar within the modeler or a separate `/decisions` route (one-of, decided at implementation time).
