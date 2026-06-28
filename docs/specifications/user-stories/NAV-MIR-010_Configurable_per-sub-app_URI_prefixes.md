# NAV-MIR-010: Configurable per-sub-app URI prefixes

> **User Story ID**: NAV-MIR-010
> **Persona**: MIR
> **Epic**: 34 — Flexible Engine Connection — Sub-app Prefixes + Native CORS
> **Milestone**: 1.0.0
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 34.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:1.0.0


As Mira (an operator running a Flowable engine with non-standard sub-app mount paths), I want to override the DMN/CMMN/App (and process) URI prefixes per connection, so that Flowatch reaches every sub-app on my deployment. Per FR-59.

**Acceptance Criteria:**

**Given** a saved connection
**When** I open its settings
**Then** advanced (collapsible) fields let me set `servicePath` / `dmnPath` / `cmmnPath` / `appPath`, with the standard defaults shown as placeholders (common case stays one-field)
**And** the fields live in the Settings connection tab + the Add/Edit connection modals (PUT-with-partial-fields family)

**Given** a prefix is left blank
**Then** the `*Base()` helper falls back to the standard Flowable default (`/service` → `/dmn-api` / `/cmmn-api` / `/app-api`) — no behavior change for existing connections

**Given** I set `dmnPath` to a custom value
**Then** every DMN `api.*` call targets root + custom path (verified in the API Inspector); the `request()` funnel is unchanged

**Given** an existing v1 connection in `localStorage`
**When** the app loads
**Then** `src/lib/saved-connections.ts` migrates it losslessly (v1→v2, optional segment strings, validated string-or-undefined) and keeps the default derivation

**And** unit/token-contract tests cover derivation, defaults, and migration; live e2e stays on defaults (no non-standard engine available — fixture/unit-verified, mirroring the form-js COMPAT-BOUNDARY discipline).
