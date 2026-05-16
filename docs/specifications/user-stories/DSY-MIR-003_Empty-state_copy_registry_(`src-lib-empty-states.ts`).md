# DSY-MIR-003: Empty-state copy registry (`src/lib/empty-states.ts`)

> **User Story ID**: DSY-MIR-003
> **Persona**: MIR
> **Epic**: 17 — Design System — three looks × themes × densities
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 17.5)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dsy, release:0.0.2


As Mira, I want every "No records." empty-state in the app to carry a screen-specific copy (e.g. "No deployments yet. Upload one from the toolbar.") sourced from a single registry, so that empty states feel intentional rather than templated. Per UX §13 deliverable.

**Acceptance Criteria:**

**Given** screens render an empty state when `data.length === 0` (Pattern P-002 four-state baseline)
**When** `src/lib/empty-states.ts` exports a typed registry mapping each screen key (`'deployments' | 'definitions' | 'instances' | 'tasks' | 'jobs' | 'history' | 'identity-users' | 'identity-groups' | 'tenants' | 'dmn-decisions' | 'attachments' | 'subscriptions' | 'batches'`) to `{ title, body, ctaLabel?, ctaHref? }`
**Then** every screen's empty-state component reads from the registry (no inline literal copy in screen files)
**And** a tsc-checked exhaustiveness assertion ensures every screen key has an entry (adding a screen forces adding its empty copy)
**And** the empty-state component renders the CTA only when `ctaLabel` is present (e.g. Deployments empty links to the Upload modal; History empty has no CTA).

---
