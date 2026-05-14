# DPL-MIR-001: Deployments list screen with pagination and tenant filter

> **User Story ID**: DPL-MIR-001
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want a list of all BPMN deployments with name, deploy time, tenant, and a delete action, so that I can see what's been pushed to the engine.

**Acceptance Criteria:**

**Given** the user navigates to `/deployments`
**When** the route loader calls `api.listDeployments({size:50, sort:'deployTime', order:'desc', tenantId})`
**Then** the screen renders four states (loading skeleton → ErrorBox → "No records." empty → DataTable)
**And** each row shows id (mono), name, deploy time (`fmtTime`), tenant, with a `⋮` action menu
**And** the action menu has `Delete (cascade)` and `Delete (no cascade)` options
**And** the URL stays as `/deployments` on filter changes (no params yet — handled in 0.0.3).
