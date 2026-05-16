# DPL-MIR-006: List deployment resources on detail page

> **User Story ID**: DPL-MIR-006
> **Persona**: MIR
> **Epic**: 9 — BPMN Deployments + Definitions
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 9.6)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dpl, release:0.0.2


As Mira, I want to see every resource bundled inside a deployment (BPMN files, DMN files, forms, other artifacts) on the deployment detail page with per-resource download, so that I can audit what got pushed and recover individual files without re-uploading. Per FR-13.

**Acceptance Criteria:**

**Given** a deployment is listed (Story 9.1) and the user navigates to `/deployments/:id`
**When** the route loader calls `api.listDeploymentResources(deploymentId)` against `/repository/deployments/{id}/resources`
**Then** the screen renders the four canonical states (loading / error / "No resources." empty / DataTable)
**And** each row shows the resource name, content type, with a `Download` action
**And** clicking `Download` fetches `/repository/deployments/{id}/resourcedata/{resourceName}` and saves the file to disk preserving the original filename
**And** the API Inspector logs every call.

---
