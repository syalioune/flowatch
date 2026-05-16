# MDL-SYS-001: Migrate BpmnModeler to TSX with vanilla bpmn-js wrapping

> **User Story ID**: MDL-SYS-001
> **Persona**: SYS
> **Epic**: 16 — BPMN + DMN Modelers (vanilla wrapping)
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 16.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:mdl, release:0.0.2


As a maintainer, I want the BPMN modeler component to be TS-typed, so that the modeler's event-bus + element selection logic is checked. Per ADR-001 + Pattern P-006.

**Acceptance Criteria:**

**Given** existing `src/modeler.jsx` has a working `BpmnModeler` component
**When** the file is migrated to `src/modeler/BpmnModeler.tsx`, the bpmn-js types are imported from `bpmn-js/lib/Modeler` typing, and the event-bus callbacks (`selection.changed`, `commandStack.changed`) have explicit types
**Then** the modeler still works in `npm run dev` (load existing definition, edit, save)
**And** `npx tsc --noEmit` passes for the file
**And** Pattern P-006 is referenced in a comment
**And** the modeler chrome (toolbar, dropdown, deploy button row) reads `--row-h` / `--pad-x` / `--pad-y` from the active `data-density` (compact / regular / comfy) so toolbar heights match the rest of the app — verified by toggling density in TweaksPanel and observing the toolbar resize without canvas remount (per UX Q-5).
