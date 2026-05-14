# RUN-MIR-002: Start a process instance from a definition

> **User Story ID**: RUN-MIR-002
> **Persona**: MIR
> **Epic**: 10 — Process Instances Runtime
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 10.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:run, release:0.0.2


As Mira, I want a "Start instance" button on the Process Definitions screen (or directly from Instances) that lets me enter a business key and initial variables, so that I can kick off a new run. Per FR-16.

**Acceptance Criteria:**

**Given** a list of process definitions exists
**When** the user clicks "Start instance" and enters definition key, business key, and JSON variables in the modal
**Then** `api.startProcessInstance({processDefinitionKey, businessKey, variables})` is called
**And** on success, the modal closes, a toast confirms, and the user is navigated to `/instances/:id` of the new instance
**And** on failure, the modal stays open with `ErrorBox` (Pattern P-003).
