# AUT-MIR-003: Settings "Authentication" tab with Basic + Bearer + OIDC

> **User Story ID**: AUT-MIR-003
> **Persona**: MIR
> **Epic**: 28 — Pluggable Authentication (Basic / Bearer / OIDC PKCE)
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 28.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:1.0.0


As Mira, I want to pick from three authentication methods in Settings, so that I can use whichever my engine is configured for. Per FR-4.

**Acceptance Criteria:**

**Given** the Settings modal has tabs (Connection / Authentication / About)
**When** the Authentication tab is implemented with three radio options (Basic / Bearer / OIDC)
**Then** picking each shows its config fields (Basic: user/pass; Bearer: token text area; OIDC: issuer, clientId, scopes)
**And** saving updates the active `AuthStrategy` in `api.ts`
**And** the strategy persists in the connection config (Story 23.2 also).
