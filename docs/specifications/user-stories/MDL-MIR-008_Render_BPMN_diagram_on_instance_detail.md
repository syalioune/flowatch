# MDL-MIR-008: Render BPMN diagram on instance detail

> **User Story ID**: MDL-MIR-008
> **Persona**: MIR
> **Epic**: 26 — Process Instance Token Overlay
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 26.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.3


As Mira, I want to see the BPMN diagram of an instance's process definition on the instance detail page, so that I have visual context.

**Acceptance Criteria:**

**Given** the user is on `/instances/:id`
**When** the page calls `api.getProcessDefinitionResource(definitionId)` and embeds the rendered BPMN via a read-only `bpmn-js` viewer (not the full modeler — use `BpmnViewer` instead)
**Then** the diagram appears on the page
**And** the diagram has fit-to-viewport applied.
