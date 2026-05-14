# MDL-MIR-006: "New from scratch" + deploy edited model

> **User Story ID**: MDL-MIR-006
> **Persona**: MIR
> **Epic**: 16 — BPMN + DMN Modelers (vanilla wrapping)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 16.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want to start a new BPMN from a blank starter and deploy it without leaving the modeler, so that the modeler is a complete authoring loop. Per FR-37.

**Acceptance Criteria:**

**Given** the user is on `/bpmn` with no `definitionId` param
**When** they click "New from scratch", the modeler loads `BLANK_BPMN_XML`
**And** when they edit + click `Deploy`, the modeler exports XML and calls `api.deployBpmn(filename, xml)`
**And** on success, the user is offered to "Open the deployed definition" (which navigates with the new `definitionId`).
