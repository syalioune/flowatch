# MDL-MIR-004: DMN decision execution history

> **User Story ID**: MDL-MIR-004
> **Persona**: MIR
> **Epic**: 15 — DMN Decisions + Execution + History
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 15.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want a history view of every rule execution (inputs, outputs, hit policy, timing), so that I can audit how decisions ran for any given process. Per FR-57.

**Acceptance Criteria:**

**Given** the user navigates to a History panel scoped to DMN
**When** `api.listDmnHistoryExecutions({size:50, decisionKey?, processInstanceId?})` is called against `/dmn-api/dmn-history/historic-decision-executions`
**Then** each row shows decision key, instance id, started, evaluation duration, hit policy
**And** clicking a row expands to show input + output variables verbatim.

---
