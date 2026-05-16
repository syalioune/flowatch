# NAV-MIR-004: Convert History + Identity + Tenants screens to routes

> **User Story ID**: NAV-MIR-004
> **Persona**: MIR
> **Epic**: 3 — TanStack Router Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 3.5)
> **State**: done
> **Labels**: type:user-story, state:done, area:nav, release:0.0.1


As Mira, I want History, Identity, and Tenants screens routable for the same bookmarking + sharing reasons as Story 3.4.

**Acceptance Criteria:**

**Given** the other screen sets are routed (Stories 3.2-3.4)
**When** `src/routes/history.tsx`, `src/routes/identity/index.tsx`, `src/routes/identity/users.$id.tsx`, `src/routes/identity/groups.$id.tsx`, `src/routes/tenants.tsx` are added
**Then** all 11 screens (Dashboard, BPMN, DMN, Deployments, Definitions, Instances, Tasks, Jobs, History, Identity, Tenants) are reachable via URL
**And** the Sidebar Active state is driven by route match (not the legacy `view` state)
**And** the legacy `view` state in `App.tsx` is removed.
