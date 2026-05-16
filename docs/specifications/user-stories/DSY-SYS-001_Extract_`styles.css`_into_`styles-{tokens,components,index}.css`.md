# DSY-SYS-001: Extract `styles.css` into `styles/{tokens,components,index}.css`

> **User Story ID**: DSY-SYS-001
> **Persona**: SYS
> **Epic**: 17 — Design System — three looks × themes × densities
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 17.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dsy, release:0.0.2


As a maintainer, I want the monolithic `styles.css` split into `tokens.css` (CSS variables per look × theme × density), `components.css` (`.btn`, `.tbl`, `.badge`, etc.), and `index.css` (imports + global resets), so that the file is more navigable. Per the post-rebuild source tree in architecture §5.

**Acceptance Criteria:**

**Given** existing `src/styles.css` works end-to-end
**When** the file is split into the three target files under `src/styles/`, preserving every variable name and class hook verbatim (ADR-005 "preserve verbatim" rule)
**Then** `npm run dev` renders identically in all 3 looks × 2 themes × 3 densities
**And** no class hook is renamed (regression test: a `grep -rE '\.(btn|tbl|badge|kpi|panel|ep-chip|seg-btn)\b'` count matches before and after).
