# NAV-SYS-001: Install TanStack Router and add the root route

> **User Story ID**: NAV-SYS-001
> **Persona**: SYS
> **Epic**: 3 — TanStack Router Foundation
> **Milestone**: 0.0.1
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 3.1)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:nav, release:0.0.1


As a maintainer, I want TanStack Router installed with a single root route mounting the chrome (Sidebar + Topbar + ApiInspector + Toaster), so that subsequent screen routes can be added incrementally without ripping out the current `App.jsx` switch.

**Acceptance Criteria:**

**Given** TanStack Router is not yet installed
**When** `@tanstack/react-router` + `@tanstack/router-vite-plugin` are installed, `src/routes/__root.tsx` is added with the chrome, and `vite.config.ts` includes the router plugin
**Then** `npm run dev` starts and the root path `/` renders the chrome
**And** the previous `view`-switch can coexist temporarily as the Dashboard placeholder.
