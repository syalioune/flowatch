# NAV-MIR-002: Convert Deployments + Definitions screens with detail routes

> **User Story ID**: NAV-MIR-002
> **Persona**: MIR
> **Epic**: 3 — TanStack Router Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 3.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:0.0.1


As Mira, I want `/deployments/:id` and `/definitions/:id` URLs that deep-link to a specific deployment or definition, so that I can share or bookmark them.

**Acceptance Criteria:**

**Given** Dashboard + BPMN + DMN are routed (Story 3.2)
**When** `src/routes/deployments/index.tsx`, `src/routes/deployments/$id.tsx`, `src/routes/definitions/index.tsx`, `src/routes/definitions/$id.tsx` are added
**Then** clicking a row navigates to the detail URL
**And** the detail route's loader fetches the resource via the appropriate `api.*` wrapper
**And** invalid IDs surface as `ErrorBox` with the verbatim engine 404 message (Pattern P-002, P-003).
