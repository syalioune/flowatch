# MDL-MIR-012: Properties panel covers DMN-specific extensions

> **User Story ID**: MDL-MIR-012
> **Persona**: MIR
> **Epic**: 30 — Flowable-Specific bpmn-js Properties Panel
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 30.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:1.0.0


As Mira, I want the DMN modeler's properties panel to expose any Flowable-specific DMN extensions, so that decisions can be authored without XML editing.

**Acceptance Criteria:**

**Given** the DMN modeler is open
**When** a decision element is selected
**Then** any Flowable-DMN extensions (if applicable) are exposed in the properties panel
**And** round-trip preserves them.
