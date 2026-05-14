# DOC-DAA-001: Add README screenshots per look

> **User Story ID**: DOC-DAA-001
> **Persona**: DAA
> **Epic**: 33 — Public Release
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 33.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:doc, release:1.0.0


As Daan (evaluator landing on the GitHub repo), I want three screenshots in the README (one per look) at the top, so that I can see what Flowatch looks like before cloning. PRD Open Question 6 (resolved as Yes).

**Acceptance Criteria:**

**Given** all three looks render correctly
**When** screenshots of the Dashboard in `editorial / light / regular`, `terminal / dark / compact`, `industrial / dark / regular` are captured (1440×900 viewport, headless Chromium via Playwright)
**Then** the three PNGs are committed under `branding/screenshots/`
**And** README.md embeds them in a row near the top with alt text per accessibility.
