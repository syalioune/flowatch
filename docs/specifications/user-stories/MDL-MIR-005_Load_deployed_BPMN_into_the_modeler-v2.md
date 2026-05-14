# MDL-MIR-005: Load deployed BPMN into the modeler

> **User Story ID**: MDL-MIR-005
> **Persona**: MIR
> **Epic**: 16 — BPMN + DMN Modelers (vanilla wrapping)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 16.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want to pick a deployed definition from a dropdown in the BPMN modeler and have its XML loaded for editing, so that I can iterate on existing process definitions. Per FR-36.

**Acceptance Criteria:**

**Given** the user is on `/bpmn` or `/bpmn?definitionId=<id>`
**When** the modeler component mounts and (a) reads the `definitionId` search param OR (b) the user picks from the dropdown populated by `api.listProcessDefinitions`
**Then** `api.getProcessDefinitionResource(id)` is called and the XML is imported via `modeler.importXML()`
**And** the canvas zooms-to-fit
**And** the "Deploy" button is enabled (the modeler tracks dirty state for re-deploy hint).
