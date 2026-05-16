# NAV-MIR-001: Convert Dashboard, BPMN, DMN screens to TanStack Router routes

> **User Story ID**: NAV-MIR-001
> **Persona**: MIR
> **Epic**: 3 — TanStack Router Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 3.2)
> **State**: done
> **Labels**: type:user-story, state:done, area:nav, release:0.0.1


As Mira, I want bookmarkable URLs for the Dashboard, BPMN modeler, and DMN modeler screens, so that I can return directly to where I was working.

**Acceptance Criteria:**

**Given** TanStack root route exists (Story 3.1)
**When** `src/routes/index.tsx` (Dashboard), `src/routes/bpmn.tsx`, and `src/routes/dmn.tsx` are added
**Then** navigating to `/`, `/bpmn`, `/dmn` renders the right screen
**And** the Sidebar nav items use `Link` components from TanStack Router with `data-active` driven by route match
**And** browser back/forward buttons work between the three.
