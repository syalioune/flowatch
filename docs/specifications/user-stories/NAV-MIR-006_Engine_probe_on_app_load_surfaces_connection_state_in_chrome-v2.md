# NAV-MIR-006: Engine probe on app load surfaces connection state in chrome

> **User Story ID**: NAV-MIR-006
> **Persona**: MIR
> **Epic**: 7 — Connection + Engine Probe
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 7.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:0.0.2


As Mira, I want a visible indicator (green / red / pending) of whether Flowatch can reach my engine, so that I notice immediately if the engine is down. Per FR-2.

**Acceptance Criteria:**

**Given** Flowatch starts and reads the connection config from localStorage
**When** the app calls `api.ping()` on mount (which hits `/management/engine`) and the result resolves
**Then** the sidebar footer's `.conn-pill` shows `data-state="ok"` (green dot) + `<engine-name> <version> @ <host>` text when the response is 200
**And** `data-state="err"` (red dot) + `unreachable: <host>` text when the request fails (any reason — network, 401, timeout)
**And** the indicator is updated when `api.setConfig()` is called (without a full reload).
