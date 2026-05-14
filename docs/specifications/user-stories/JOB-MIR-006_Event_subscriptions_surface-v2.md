# JOB-MIR-006: Event subscriptions surface

> **User Story ID**: JOB-MIR-006
> **Persona**: MIR
> **Epic**: 24 — Operations Visibility — Batches + Event Subscriptions
> **Milestone**: 0.0.3
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 24.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:job, release:0.0.3


As Mira, I want to see what messages/signals/timers a running instance is waiting on, so that I can diagnose stuck instances. Per FR-54.

**Acceptance Criteria:**

**Given** the user is on an instance detail page
**When** `api.listEventSubscriptions({processInstanceId: id})` is called
**Then** the page shows each subscription's eventType, eventName, created date
**And** the list is also accessible via `/events?processInstanceId=:id`.
