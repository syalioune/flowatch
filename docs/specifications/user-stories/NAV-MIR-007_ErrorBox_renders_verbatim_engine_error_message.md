# NAV-MIR-007: ErrorBox renders verbatim engine error message

> **User Story ID**: NAV-MIR-007
> **Persona**: MIR
> **Epic**: 7 — Connection + Engine Probe + Dashboard
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 7.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:0.0.2


As Mira, I want every error rendered in `ErrorBox` to show the literal engine response body (no friendly rewrites), so that I can diagnose what the engine actually said. Per FR-3 and Pattern P-003.

**Acceptance Criteria:**

**Given** a screen makes an API call that returns 4xx or 5xx with a JSON or text body
**When** `ErrorBox` renders the resulting `Error.message`
**Then** the displayed text is byte-for-byte identical to the engine's response body
**And** the HTTP status is shown as `HTTP NNN` above the message
**And** a `Retry` button calls the screen's `useApi.reload()`
**And** an `Open Inspector` link opens the API Inspector drawer scrolled to the failed call (the link is wired once Story 8.2 ships the drawer; until then it is rendered as a disabled hint).
**And** the legacy `.conn-pill[data-state="mock"]` value is removed from the sidebar footer styles (mock-mode path was deleted from `api.ts`; the warn-yellow tri-state collapses to ok/err per UX §10).
