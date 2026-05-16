# AUT-SAS-001: Implement Bearer (paste-a-token) auth strategy

> **User Story ID**: AUT-SAS-001
> **Persona**: SAS
> **Epic**: 28 — Pluggable Authentication (Basic / Bearer / OIDC PKCE)
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 28.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:1.0.0


As a developer testing a custom Spring Security setup, I want to paste a Bearer token into Settings and have Flowatch use it for all calls, so that I can test OAuth without configuring the full PKCE flow.

**Acceptance Criteria:**

**Given** the Settings Auth tab Bearer option (Story 28.2)
**When** the user pastes a token and saves
**Then** every API call sends `Authorization: Bearer <token>` (no longer Basic)
**And** when the engine returns 401, the strategy's `onUnauthorized()` opens the Settings modal at the Auth tab.
