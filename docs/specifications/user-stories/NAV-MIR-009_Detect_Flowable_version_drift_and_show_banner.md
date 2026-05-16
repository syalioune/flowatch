# NAV-MIR-009: Detect Flowable version drift and show banner

> **User Story ID**: NAV-MIR-009
> **Persona**: MIR
> **Epic**: 31 — Engine Version Compatibility Warning
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 31.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:1.0.0


As Mira, I want a non-blocking banner if I'm running a Flowable version Flowatch hasn't been tested against, so that I know to expect potential issues. Per NFR-7.

**Acceptance Criteria:**

**Given** `api.ping()` returns the engine version
**When** the version doesn't match the `tested-against` version recorded in `docs/compat.md` (e.g. operator runs 7.5 but Flowatch was tested against 7.2)
**Then** a dismissable banner appears in the chrome reading "Flowatch is tested against Flowable 7.2.0. Detected: 7.5.0 — some features may differ. See docs/compat.md."
**And** clicking dismiss persists the dismissal for that version in localStorage.

---
