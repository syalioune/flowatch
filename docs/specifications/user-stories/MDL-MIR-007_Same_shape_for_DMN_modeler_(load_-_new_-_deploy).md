# MDL-MIR-007: Same shape for DMN modeler (load / new / deploy)

> **User Story ID**: MDL-MIR-007
> **Persona**: MIR
> **Epic**: 16 — BPMN + DMN Modelers (vanilla wrapping)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 16.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want the DMN modeler experience to mirror the BPMN modeler (load existing decision, new from scratch, deploy via multipart), so that I'm not learning two different workflows. Per FR-34.

**Acceptance Criteria:**

**Given** Story 16.3 establishes the BPMN authoring loop
**When** `src/modeler/DmnModeler.tsx` is implemented with the same lifecycle but using dmn-js + `dmnBase()` (Pattern P-004)
**Then** the DMN modeler loads decisions via `api.getDmnResource(deploymentId, resourceId)`
**And** deploys via `api.deployDmn(filename, xml)`
**And** uses `LOAN_DMN_XML` as the starter for "new from scratch".

---
