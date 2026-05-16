# AUT-SYS-001: Refactor `api.ts` for AuthStrategy interface

> **User Story ID**: AUT-SYS-001
> **Persona**: SYS
> **Epic**: 28 — Pluggable Authentication (Basic / Bearer / OIDC PKCE)
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 28.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:aut, release:1.0.0


As a maintainer, I want `api.ts` to delegate Authorization header generation to a pluggable `AuthStrategy` interface, so that adding a new auth method doesn't touch every wrapper. Per ADR-009, FR-4.

**Acceptance Criteria:**

**Given** the current `api.ts` hard-codes Basic auth
**When** an `AuthStrategy` interface is added (`kind`, `authorizationHeader()`, optional `onUnauthorized()`) and `request()` calls `authStrategy.authorizationHeader()`
**Then** the existing Basic strategy is implemented as a concrete `BasicAuthStrategy` and assigned by default
**And** all existing API tests still pass.
