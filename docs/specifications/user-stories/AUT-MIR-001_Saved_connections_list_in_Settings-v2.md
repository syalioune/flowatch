# AUT-MIR-001: Saved connections list in Settings

> **User Story ID**: AUT-MIR-001
> **Persona**: MIR
> **Epic**: 23 — Multi-Connection Support
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 23.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:0.0.3


As Mira, I want a list of saved Flowable connections (e.g. local-dev, staging, prod) with quick-switch, so that I don't re-enter credentials when switching environments. Per FR-49.

**Acceptance Criteria:**

**Given** Settings is open
**When** the user clicks "Manage connections", adds a new connection with a label, baseUrl, username, password, tenant
**Then** the connection is persisted in localStorage `flowatch.connections.v1` (a new structure, not the single `flowatch.connection.v1`)
**And** a connection picker in the Topbar (next to tenant) allows quick switching
**And** picking a connection updates `api.config()` and triggers `api.ping()` to refresh the indicator.
