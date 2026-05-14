# MDL-MIR-003: Execute a decision with input variables

> **User Story ID**: MDL-MIR-003
> **Persona**: MIR
> **Epic**: 15 — DMN Decisions + Execution + History
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 15.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want to run a decision-table with sample inputs (without involving a process instance), so that I can test the rules in isolation. Per FR-33.

**Acceptance Criteria:**

**Given** a decision is listed
**When** the user clicks "Test execute" and provides JSON input variables in a modal
**Then** `api.executeDecision({ decisionKey, inputVariables })` is called
**And** the output is rendered in a result panel with the matched rules + output variables
**And** the call appears in the API Inspector as a `POST /dmn-rule/execute`.
