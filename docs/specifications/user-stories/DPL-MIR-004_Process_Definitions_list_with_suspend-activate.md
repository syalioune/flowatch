# DPL-MIR-004: Process Definitions list with suspend/activate

> **User Story ID**: DPL-MIR-004
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want to see all process definitions and toggle their suspend state per row, so that I can pause buggy ones without redeploying. Per FR-14.

**Acceptance Criteria:**

**Given** the user navigates to `/definitions`
**When** the route loader calls `api.listProcessDefinitions({size:50, sort:'name', tenantId})`
**Then** each row shows name, key, version, tenant, suspended status (badge), with a `Suspend` / `Activate` toggle action
**And** clicking the toggle calls `api.suspendProcessDefinition(id, suspend)` and updates the badge optimistically
**And** on failure, the badge reverts and an error toast surfaces.
