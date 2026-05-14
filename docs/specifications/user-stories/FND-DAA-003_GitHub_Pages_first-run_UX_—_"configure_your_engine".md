# FND-DAA-003: GitHub Pages first-run UX — "configure your engine"

> **User Story ID**: FND-DAA-003
> **Persona**: DAA
> **Epic**: 6 — Docker & Distribution Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 6.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:fnd, release:0.0.1


As Daan, I want the GitHub Pages demo to greet me with a clear "Flowatch is the GUI; you need a Flowable engine to point it at" message when no engine is reachable, so that I'm not stuck staring at "engine unreachable" errors.

**Acceptance Criteria:**

**Given** the GitHub Pages build has no Flowable engine to talk to
**When** Flowatch's `ping()` on app load fails (NetworkError or 0 status)
**Then** the Dashboard renders a first-run welcome card explaining "Flowatch needs a Flowable engine. Configure connection →" with a primary button opening the Settings modal
**And** clicking outside the card dismisses it (next page loads will show the standard error states per Pattern P-002)
**And** README.md documents that the Pages build is a "bring your own engine" demo.

---
