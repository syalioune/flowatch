# I18N-MIR-003: Keyboard cheatsheet modal (`?`)

> **User Story ID**: I18N-MIR-003
> **Persona**: MIR
> **Epic**: 18 — Accessibility + Snapshot Coverage
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 18.4)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:i18n, release:0.0.2


As Mira (keyboard user), I want a modal listing every global keyboard shortcut Flowatch supports, opened with the `?` key, so that I can discover navigation and command shortcuts without reading the README. Per UX §11.

**Acceptance Criteria:**

**Given** the user has focus anywhere outside a text input or contenteditable element
**When** the user presses `Shift+/` (the `?` key)
**Then** a modal opens listing every registered shortcut: global navigation (`g d` Dashboard, `g i` Instances, `g t` Tasks, etc.), TweaksPanel toggle (`Ctrl+Shift+T`), modal close (`Esc`), and the cheatsheet itself (`?`)
**And** the modal is grouped by category (Navigation / Tweaks / Modals) and each row shows the key combo (rendered in `<kbd>` tags) + the action
**And** the modal traps focus (Tab cycles within it), closes on `Esc`, and is documented as the canonical place to register new shortcuts (a `src/lib/shortcuts.ts` registry feeds both the listener and the modal — no parallel source of truth).

---
