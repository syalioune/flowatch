# DOC-DAA-002: Social-preview card for the GitHub repo

> **User Story ID**: DOC-DAA-002
> **Persona**: DAA
> **Epic**: 33 — Public Release
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 33.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:doc, release:1.0.0


As Daan, I want a clear social preview card when someone shares the GitHub repo URL on Twitter/LinkedIn, so that the project's purpose is communicated at-a-glance.

**Acceptance Criteria:**

**Given** Flowatch is published
**When** an SVG/PNG social-preview card is created showing the lockup + tagline + "OSS GUI for Flowable 7+ OSS"
**Then** the card is uploaded to GitHub repo settings → Social preview
**And** sharing the repo URL renders the card on major social platforms (verified manually).

**Carry-forward note (added by sprint-change-proposal-2026-05-17):**
The landing page itself ships in milestone 0.0.1 (Epic 6, Stories 6.6 + 6.7, PRD FR-F12 / FR-F13). The 1.0.0 Epic 33 stories enrich it as follow-ups:

- After **Story 33.1** (screenshots per look) lands, open a follow-up story to back-fill the screenshots strip into `landing/index.html`.
- **Story 33.2** (forum post) MUST link `https://syalioune.github.io/flowatch/` as the primary CTA, not the bare GitHub repo URL.
- **Story 33.3** (social-preview card) MUST reuse the lockup + tagline string from `landing/index.html` for visual continuity.

---
