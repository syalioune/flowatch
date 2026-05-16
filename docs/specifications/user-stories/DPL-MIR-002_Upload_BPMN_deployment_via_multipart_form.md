# DPL-MIR-002: Upload BPMN deployment via multipart form

> **User Story ID**: DPL-MIR-002
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want a "Upload" button on the Deployments screen that lets me pick a `.bpmn` file from disk and deploy it, so that I don't have to use the modeler or curl. Per FR-11.

**Acceptance Criteria:**

**Given** the user is on `/deployments`
**When** the user clicks the "Upload" button, picks a `.bpmn` or `.bpmn20.xml` file, and submits the modal
**Then** `api.deployBpmn(filename, fileContents)` is called (multipart POST to `/repository/deployments`)
**And** on success, a toast appears with "Deployed: <id>" and the list reloads
**And** on failure, the modal stays open with `ErrorBox` showing the verbatim engine message (Pattern P-003).
