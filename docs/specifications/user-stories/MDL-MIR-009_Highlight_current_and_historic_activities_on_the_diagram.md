# MDL-MIR-009: Highlight current and historic activities on the diagram

> **User Story ID**: MDL-MIR-009
> **Persona**: MIR
> **Epic**: 26 — Process Instance Token Overlay
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 26.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.3


As Mira, I want completed and current activities highlighted on the diagram (color-coded), so that I can see where an instance is in its flow at a glance. Per FR-29.

**Acceptance Criteria:**

**Given** Story 26.1 renders the diagram
**When** `api.listHistoricActivities({processInstanceId: id})` returns the activity history and the page applies `bpmn-js` element-color overrides (e.g. green for completed, yellow for current)
**Then** the diagram visually shows the instance's path
**And** the current activity (if instance still active) is highlighted distinctly from completed activities.
