# NAV-MIR-005: Load + persist connection config from localStorage

> **User Story ID**: NAV-MIR-005
> **Persona**: MIR
> **Epic**: 7 — Connection + Engine Probe
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 7.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:0.0.2


As Mira, I want my last-used Flowable connection settings to persist across browser sessions, so that I don't re-enter credentials every time. Per FR-1.

**Acceptance Criteria:**

**Given** the user has opened the Settings modal and saved `baseUrl=http://prod:8080/flowable-rest/service`, `username=admin`, `password=…`, `tenantId=acme`
**When** the user reloads the page
**Then** `api.config()` returns the persisted values
**And** the values come from `localStorage` key `flowatch.connection.v1` (per the rename — see project-context)
**And** if no localStorage value exists, defaults (`http://localhost:8080/flowable-rest/service`, `rest-admin`, `test`, no tenant) are used.
