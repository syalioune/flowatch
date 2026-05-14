# AUT-MIR-002: Per-connection auth strategy

> **User Story ID**: AUT-MIR-002
> **Persona**: MIR
> **Epic**: 23 — Multi-Connection Support
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 23.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:0.0.3


As Mira, I want each saved connection to remember its auth strategy (Basic / Bearer / OIDC config), so that I don't reconfigure auth every switch.

**Acceptance Criteria:**

**Given** multi-connection storage exists (Story 23.1)
**When** the user configures different auth strategies per connection
**Then** `flowatch.connections.v1[connectionId].authStrategy` stores the relevant config
**And** switching connection switches auth strategy in `api.ts`'s `authStrategy` slot.
