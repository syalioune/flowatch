# NAV-SYS-002: Remove `VIEW_TITLE` and `ENDPOINT_BY_VIEW` legacy maps

> **User Story ID**: NAV-SYS-002
> **Persona**: SYS
> **Epic**: 3 — TanStack Router Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 3.6)
> **State**: done
> **Labels**: type:user-story, state:done, area:nav, release:0.0.1


As a maintainer, I want the legacy `VIEW_TITLE` and `ENDPOINT_BY_VIEW` constants gone, so that the three-place-to-update toil is eliminated. Per FR-F5 and the PRD "add a new screen" task simplification.

**Acceptance Criteria:**

**Given** every screen is now a TanStack Router route (Stories 3.2-3.5)
**When** `VIEW_TITLE` and `ENDPOINT_BY_VIEW` are removed from `src/App.tsx` and each route file declares its own `title` and `endpoints` metadata (via route `meta` or a small `useRouteMetadata()` hook)
**Then** the Topbar title comes from the active route's metadata
**And** the PageHead endpoint chips come from the active route's `endpoints` metadata
**And** adding a new screen requires editing exactly one file (the new route).

---
