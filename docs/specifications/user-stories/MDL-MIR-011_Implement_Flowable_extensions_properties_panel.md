# MDL-MIR-011: Implement Flowable extensions properties panel

> **User Story ID**: MDL-MIR-011
> **Persona**: MIR
> **Epic**: 30 — Flowable-Specific bpmn-js Properties Panel
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 30.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:1.0.0


As Mira, I want the BPMN modeler's properties panel to expose Flowable-specific element extensions (assignees, candidate groups, listeners, form refs, async/exclusive flags), so that I don't have to edit XML by hand. Per FR-38.

**Acceptance Criteria:**

**Given** the BPMN modeler is open with a UserTask selected
**When** the properties panel mounts
**Then** it shows fields for `flowable:assignee`, `flowable:candidateUsers`, `flowable:candidateGroups`, `flowable:formKey`, `flowable:async`, `flowable:exclusive`, `flowable:executionListener`, `flowable:taskListener`
**And** editing each field updates the element's `extensionElements` in the BPMN XML
**And** the XML round-trip (export → re-import) preserves all Flowable-specific extensions (no data loss like Camunda Modeler's round-trip issue cited in market research).
