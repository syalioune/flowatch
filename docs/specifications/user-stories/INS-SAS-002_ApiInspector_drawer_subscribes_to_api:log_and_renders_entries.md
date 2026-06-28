# INS-SAS-002: ApiInspector drawer subscribes to api:log and renders entries

> **User Story ID**: INS-SAS-002
> **Persona**: SAS
> **Epic**: 8 — API Inspector — observability differentiator
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 8.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:ins, release:0.0.2


As Sasha, I want a right-edge drawer that shows API_LOG entries in real time, so that I can see exactly what Flowatch is doing when I click around. Per FR-7, UX spec Direction D-1.

**Acceptance Criteria:**

**Given** the API_LOG event bus fires (Story 8.1)
**When** the user clicks the Inspector icon in the Topbar
**Then** a drawer slides in from the right (320–480 px wide) and lists the 60 most-recent API calls
**And** each row shows: method (color-coded), path, status, ms, time-ago
**And** clicking a row expands it to show: full URL, request body (if any), response body (truncated to 4 KB)
**And** the drawer can be filtered by method and by status range (2xx / 4xx / 5xx).
