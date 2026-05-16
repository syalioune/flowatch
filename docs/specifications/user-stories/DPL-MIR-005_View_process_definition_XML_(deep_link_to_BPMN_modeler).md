# DPL-MIR-005: View process definition XML (deep link to BPMN modeler)

> **User Story ID**: DPL-MIR-005
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.5)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want a "View XML" or "Open in modeler" action on a definition that loads its BPMN into the modeler in read-only or edit mode, so that I can inspect or modify it without copy-pasting. Per FR-14, FR-36.

**Acceptance Criteria:**

**Given** a definition is listed (Story 9.4)
**When** the user picks `Open in modeler` from the row action menu
**Then** the app navigates to `/bpmn?definitionId=<id>`
**And** the BPMN modeler loader picks up the search param, calls `api.getProcessDefinitionResource(id)`, and imports the XML
**And** the modeler shows the current XML loaded with the dropdown set to the chosen definition.
