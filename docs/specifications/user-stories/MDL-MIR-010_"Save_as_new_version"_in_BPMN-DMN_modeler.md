# MDL-MIR-010: "Save as new version" in BPMN/DMN modeler

> **User Story ID**: MDL-MIR-010
> **Persona**: MIR
> **Epic**: 27 — Model Versioning in Modeler
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 27.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.3


As Mira, I want a "Save as new version" button in the modeler that explicitly bumps the version, so that I can keep prior versions accessible. Per FR-59.

**Acceptance Criteria:**

**Given** the modeler has loaded a deployed definition
**When** the user clicks "Save as new version" (vs. just "Deploy")
**Then** the modeler exports XML and calls `api.deployBpmn(filename, xml)` (Flowable auto-versions per-key on each deployment)
**And** the modeler reloads the definitions dropdown, showing both the old and new versions
**And** the previously-loaded version's URL is preserved (e.g. via a "View previous version" link in the modeler header).

---
