# AUT-MIR-002: Per-connection auth strategy config (persistence only)

> **User Story ID**: AUT-MIR-002
> **Persona**: MIR
> **Epic**: 23 — Multi-Connection Support
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 23.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:0.0.3


As Mira, I want each saved connection to remember the *kind* of auth it expects (Basic / Bearer / OIDC config), so that the value survives connection switches and is ready to activate once the AuthStrategy interface lands in milestone 1.0.0 (Story 28.1). This story persists configuration only; the active-strategy switch in `api.ts` is deferred to Epic 28.

**Acceptance Criteria:**

**Given** multi-connection storage exists (Story 23.1)
**When** the user fills `{ kind: "basic" | "bearer" | "oidc", config: { … } }` on the per-connection form
**Then** `flowatch.connections.v1[connectionId].authStrategyConfig` stores the chosen kind + its config blob (Basic credentials, Bearer token, OIDC issuer/clientId/scopes)
**And** the persisted shape passes a JSON-schema round-trip (read → write → read → equal)
**And** the active runtime call path remains Basic auth as today — **no Authorization header swapping yet** (that lands in Story 28.1 + 28.2 when the `AuthStrategy` interface and Settings Authentication tab ship)
**And** the field validation rejects malformed configs with verbatim Zod-style error text in the Settings modal.

**Cross-milestone note:** Story 28.1 (AuthStrategy interface) consumes `authStrategyConfig` and switches the active strategy when a connection becomes active. This story is the persistence half; Story 28.1 + 28.2 + 28.3 + 28.4 are the activation halves.
