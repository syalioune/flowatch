# RUN-MIR-005: Tasks list with assignee filter

> **User Story ID**: RUN-MIR-005
> **Persona**: MIR
> **Epic**: 11 — Tasks + Task Forms
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 11.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want a list of tasks filterable by assignee (me / unassigned / all), so that I can see what's mine to work on. Per FR-20.

**Acceptance Criteria:**

**Given** the user navigates to `/tasks?assignee=me`
**When** the route loader calls `api.listTasks({size:50, assignee: currentUser})`
**Then** each row shows task name, assignee, process instance id, due date (`fmtDue`), priority
**And** changing the search param to `?assignee=all` removes the filter
**And** task counts appear as nav-badge counts in the Sidebar (`api.listTasks({size:0})` for total).
