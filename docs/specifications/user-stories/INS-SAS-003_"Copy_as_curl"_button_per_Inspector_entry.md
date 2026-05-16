# INS-SAS-003: "Copy as curl" button per Inspector entry

> **User Story ID**: INS-SAS-003
> **Persona**: SAS
> **Epic**: 8 — API Inspector — observability differentiator
> **Milestone**: 0.0.2
> **Source**: `_bmad-output/planning-artifacts/epics.md` (story 8.3)
> **State**: backlog
> **Labels**: type:user-story, state:backlog, area:ins, release:0.0.2


As Sasha, I want a "Copy as curl" button on each entry so that I can paste the request into a terminal and reproduce it verbatim. Per FR-9.

**Acceptance Criteria:**

**Given** an Inspector entry is expanded (Story 8.2)
**When** the user clicks the "Copy as curl" button
**Then** the clipboard contains a `curl` invocation with the method, URL, `-u <username>:<password>` from the active connection (NOT redacted in this case — clipboard is intentional), the `Content-Type` header if applicable, and the request body
**And** a toast confirms "Copied curl command"
**And** the generated command, when pasted into a shell with the right tools, reproduces the call.
