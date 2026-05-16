# NAV-MIR-008: Dashboard with per-tile state handling

> **User Story ID**: NAV-MIR-008
> **Persona**: MIR
> **Epic**: 7 — Connection + Engine Probe + Dashboard
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 7.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:0.0.2


As Mira, I want a Dashboard that shows me the engine's current load at a glance — running instances, failing jobs, my open tasks, deployment count — and that keeps rendering tiles for whatever the engine *can* answer when other calls fail, so that one slow or broken endpoint doesn't blank the entire screen. Per FR-3 and NFR-6.

**Acceptance Criteria:**

**Given** the user navigates to `/` (Dashboard route, established in Story 3.2)
**When** the route loader fires four parallel API calls via `Promise.allSettled` (NFR-3):
  - `api.listProcessInstances({ size: 0 })` → Process Instances tile count
  - `api.listJobs({ size: 0, withException: true })` → Failing Jobs tile count
  - `api.listTasks({ size: 0, assignee: currentUser })` → My Tasks tile count
  - `api.listDeployments({ size: 0 })` → Deployments tile count
**Then** the Dashboard renders four KPI tiles in a `.kpi-grid` (per UX §10 chrome inventory)
**And** each tile renders **independently** one of four states:
  - **loading** — `.kpi-val` shows a shimmering skeleton matching the eventual digit width
  - **error** — `.kpi-val` shows `—` and a small inline `.badge[data-tone="bad"]` reading "HTTP 5xx" with the verbatim engine message available on hover/Inspector deep-link
  - **empty** — `.kpi-val` shows `0` (legitimate empty state, not styled as error)
  - **data** — `.kpi-val` shows the integer count + `.kpi-lbl` ("Running instances", "Failing jobs", "My tasks", "Deployments")
**And** **tile-level partial failure is verified by an integration test** — Playwright spins the Flowable stack, kills the jobs endpoint, reloads `/`, asserts: Process Instances + My Tasks + Deployments tiles render with data; Failing Jobs tile renders the error variant; no full-screen `ErrorBox` appears (NFR-6 contract)
**And** each tile is **clickable** — Process Instances → `/instances`, Failing Jobs → `/jobs?type=executable` (with `withException=true` preset), My Tasks → `/tasks?assignee=me`, Deployments → `/deployments`
**And** the Dashboard renders the four canonical states **per tile**, not per page (i.e. there is no top-level Dashboard ErrorBox; the page is "tile-shaped" not "list-shaped").

---
