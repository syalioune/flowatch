# IDT-MIR-004: Tenants screen + chrome tenant cycle

> **User Story ID**: IDT-MIR-004
> **Persona**: MIR
> **Epic**: 14 — Identity (users + groups) + Tenants
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 14.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:idt, release:0.0.2


As Mira (operating a multi-tenant Flowable engine), I want a dedicated Tenants screen listing every distinct tenant the engine knows about, plus a tenant-cycle control in the chrome that scopes every screen to a single tenant, so that I can audit and operate per tenant without re-typing the tenant id on every filter. Per FR-31.

**Acceptance Criteria:**

**Given** flowable-rest 7.2.0 does NOT expose `/identity/tenants` (verified in compat.md)
**When** `api.listTenants()` derives distinct tenant ids by paging `/repository/deployments?size=200` and collecting `tenantId` values (per the existing api.js workaround documented in CLAUDE.md)
**Then** the user navigates to `/tenants` and sees a list of tenant ids with their deployment count (loading / error / "No tenants." empty / DataTable)
**And** the chrome Topbar shows a tenant-cycle dropdown (next to the connection pill) populated from the same derivation
**And** picking a tenant in the dropdown writes `flowatch.connection.v1.tenantId` and reloads route loaders so every list reflects the chosen scope
**And** picking "All tenants" clears the tenant filter
**And** the derivation is cached for 60 seconds (avoid hammering `/repository/deployments` on every chrome render).

---
