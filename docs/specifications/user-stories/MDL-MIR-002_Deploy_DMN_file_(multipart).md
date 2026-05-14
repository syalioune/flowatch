# MDL-MIR-002: Deploy DMN file (multipart)

> **User Story ID**: MDL-MIR-002
> **Persona**: MIR
> **Epic**: 15 — DMN Decisions + Execution + History
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 15.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As Mira, I want to upload a `.dmn` file similarly to BPMN deploys, so that I can ship decision-table updates the same way as process updates. Per FR-33.

**Acceptance Criteria:**

**Given** the user clicks "Deploy DMN" on the DMN screen
**When** they pick a `.dmn` file and confirm
**Then** `api.deployDmn(filename, contents)` is called (multipart against `dmnBase()`)
**And** on success, a toast confirms with the deployment id
**And** the decisions list reloads.
