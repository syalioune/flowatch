# DPL-MIR-001: Deployments list screen with pagination and tenant filter

> **User Story ID**: DPL-MIR-001
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want a list of all BPMN deployments with name, deploy time, tenant, and a delete action, so that I can see what's been pushed to the engine.

**Note — canonical List archetype (MN-8 resolution):** Story 9.1's shape is the canonical "List screen" archetype for v1. Stories 10.1, 11.1, 12.1, 13.1, 14.1, and 15.1 MUST copy its structure verbatim (same four-state contract, same `⋮` action menu pattern, same URL/query-param convention, same skeleton component, same Pattern P-002 wiring) — drift between list screens is a code-review block. If a future requirement demands divergence beyond row content, an explicit "Extract `<ListScreen>` archetype" story is added to Epic 17 instead.

**Acceptance Criteria:**

**Given** the user navigates to `/deployments`
**When** the route loader calls `api.listDeployments({size:50, sort:'deployTime', order:'desc', tenantId})`
**Then** the screen renders four states (loading skeleton → ErrorBox → "No records." empty → DataTable)
**And** each row shows id (mono), name, deploy time (`fmtTime`), tenant, with a `⋮` action menu
**And** the action menu has `Delete (cascade)` and `Delete (no cascade)` options
**And** the URL stays as `/deployments` on filter changes (no params yet — handled in 0.0.3)
**And** the empty state pulls its copy from the `empty-states.ts` registry (Story 17.5), not an inline literal.
