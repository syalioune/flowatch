# DSY-MIR-001: Wire TweaksPanel keyboard shortcut + palette icon

> **User Story ID**: DSY-MIR-001
> **Persona**: MIR
> **Epic**: 17 — Design System — three looks × themes × densities
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 17.2)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:dsy, release:0.0.2


As Mira, I want Ctrl+Shift+T to toggle the TweaksPanel (Look / Theme / Density / Accent), so that I can quickly try different visual modes. Per FR-42.

**Acceptance Criteria:**

**Given** the existing TweaksPanel logic in `src/tweaks-panel.tsx`
**When** the global `keydown` listener catches Ctrl+Shift+T and dispatches `window.postMessage({type:'__activate_edit_mode'})`
**Then** the panel toggles visibility
**And** clicking the palette icon in the Topbar does the same
**And** changes persist to localStorage and are restored on reload.
