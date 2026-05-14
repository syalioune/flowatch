# AUT-MIR-004: Implement OIDC PKCE flow via react-oidc-context

> **User Story ID**: AUT-MIR-004
> **Persona**: MIR
> **Epic**: 28 — Pluggable Authentication (Basic / Bearer / OIDC PKCE)
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 28.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:1.0.0


As Mira (in an enterprise env), I want full OIDC Authorization Code with PKCE, so that I can use my org's IdP (Keycloak etc.). Per ADR-009.

**Acceptance Criteria:**

**Given** `react-oidc-context` is installed and the Auth tab OIDC option (Story 28.2) is configured with issuer + clientId + scopes
**When** the user starts a session
**Then** Flowatch redirects to the IdP, handles the callback, stores tokens in memory (NOT localStorage, per NFR-11), and calls `api.*` with the access token as `Authorization: Bearer`
**And** silent renew (refresh token with `offline_access` scope) works without UI disruption
**And** a "Sign out" button revokes the session.
