# NAV-MIR-003: Convert Process Instances + Tasks + Jobs screens to routes

> **User Story ID**: NAV-MIR-003
> **Persona**: MIR
> **Epic**: 3 — TanStack Router Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 3.4)
> **State**: done
> **Labels**: type:user-story, state:done, area:nav, release:0.0.1


As Mira, I want every operations screen reachable via URL so that I can bookmark "open dead-letter jobs" or "my tasks" pre-filtered.

**Acceptance Criteria:**

**Given** detail routes pattern is established (Story 3.3)
**When** `src/routes/instances/index.tsx`, `src/routes/instances/$id.tsx`, `src/routes/tasks/index.tsx`, `src/routes/tasks/$id.tsx`, `src/routes/jobs.tsx` are added with search params for filters (`?type=executable|timer|deadletter`, `?assignee=me|all`)
**Then** `/jobs?type=deadletter` opens the Jobs screen with the dead-letter tab active
**And** `/tasks?assignee=me` filters tasks to the active user
**And** search param state is typed (TanStack Router auto-types via Zod schema).
