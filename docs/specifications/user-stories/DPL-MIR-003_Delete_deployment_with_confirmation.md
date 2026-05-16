# DPL-MIR-003: Delete deployment with confirmation

> **User Story ID**: DPL-MIR-003
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want to delete a deployment with a confirmation step (and explicit "cascade" choice), so that I don't accidentally remove production data.

**Acceptance Criteria:**

**Given** a deployment is listed (Story 9.1)
**When** the user picks `Delete` from the row action menu
**Then** a confirmation modal appears with the deployment id + name + a "cascade" checkbox (default off)
**And** clicking Confirm calls `api.deleteDeployment(id, cascade)`
**And** on success, the row disappears from the list and a toast appears
**And** on failure, an error toast surfaces the verbatim engine message.
