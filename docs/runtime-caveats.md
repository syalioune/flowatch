# Runtime caveats

Browser / shell / regex / clipboard / serialisation quirks that bit us in
review. Spec authors must cross-reference this file when prescribing a
runtime assertion — the API often does not do what naive intuition says it
does, and live-code greps (Epic 7 retro A-1) catch missing symbols but
not behavioural drift.

The list is empirical. It only contains quirks that produced a real
review patch or a deferred-work entry. New entries are appended at the
bottom with a back-link to the originating story / retro section.

## How to use this file

- Spec authoring: when an AC prescribes a browser API call, shell command,
  regex, `JSON.stringify`/`JSON.parse`, or a React effect dep, scan this
  file first. If a relevant caveat exists, encode the workaround in the
  AC / task list — don't leave it for the dev to rediscover and the
  reviewer to flag.
- Code review: when you spot one of these patterns in a diff, link the
  caveat number in the review comment.
- Adding entries: keep them runtime-quirk-shaped ("the API does X, naive
  intuition says it does Y, the workaround is Z"). Pure architecture
  preferences and project conventions live in CLAUDE.md / architecture.md
  instead.

---

## RC-1 — `new CustomEvent(name, { detail: undefined })` coerces to `null`

**Naive intuition:** the listener receives `event.detail === undefined`.

**Actual behaviour:** per WHATWG DOM, `detail` defaults to `null` when
the dictionary entry is `undefined`. `event.detail === null`.

**Workaround:** assert against the *property you care about*, not
`detail` itself. `expect(ev.detail?.focusEntryId).toBeUndefined()` is
robust; `expect(ev.detail).toBeUndefined()` is not.

**Surfaced by:** Story 8.2 ErrorBox.spec assertion change ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-2 — `navigator.clipboard` is a non-configurable getter in Chromium

**Naive intuition:** `Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true })` deletes the API for testing.

**Actual behaviour:** in real Chromium (and the Vitest browser-mode
provider), `navigator.clipboard` is a non-configurable accessor.
`defineProperty` silently no-ops; the property stays. A test that
"deletes" `clipboard` and asserts feature-detect behaviour passes only
in JSDOM, not in browser-mode.

**Workaround:** for the available-but-failing path, use
`vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(...)`.
For the truly-unavailable path, you cannot fake it inside the test —
either skip the assertion in browser-mode or wrap the consumer in a
helper that reads `navigator.clipboard` through an indirection you
can stub.

**Surfaced by:** Story 8.3 clipboard mock approach ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-3 — React identity-bail on stable-value props blocks re-firing effects

**Naive intuition:** dispatching the same primitive value twice through a
state-setter re-runs the dependent effect.

**Actual behaviour:** React's reconciliation bails when
`Object.is(prev, next)` is true. `setFocusEntryId("entry-42")` followed
by `setFocusEntryId("entry-42")` is a no-op — the effect with
`[focusEntryId]` dependency does not re-fire. UX: "clicking the same
ErrorBox twice doesn't re-scroll the drawer."

**Workaround:** wrap transient triggers in a `{ value, seq }` shape and
bump `seq` on every producer call. The object identity changes every
time, so the effect always re-fires.

```ts
setFocusEntry({ id: "entry-42", seq: seqRef.current++ });
```

**Surfaced by:** Story 8.2 P1 review patch. See [Epic 8 retro §4.2](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#42-the-id-seq-wrapper-is-the-canonical-react-identity-bail-antidote) — proposed for promotion to a P-010 pattern note.

## RC-4 — `\b` regex word-boundary is GNU-grep only

**Naive intuition:** `grep -E '\bfetch\(' file.ts` works everywhere.

**Actual behaviour:** BSD/macOS `grep` does not honour `\b`. It silently
matches zero lines. The script passes on Mac contributors' machines
without inspecting the codebase.

**Workaround:** use POSIX character-class negation:
`(^|[^A-Za-z0-9_])fetch[[:space:]]*\(`. Works on both GNU and BSD grep.

**Surfaced by:** Story 8.4 P2 review patch ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-5 — `mktemp -t TEMPLATE` is GNU-only

**Naive intuition:** `mktemp -t prefix.XXXXXX` is portable.

**Actual behaviour:** GNU `mktemp` interprets `-t` as "use $TMPDIR";
BSD `mktemp` interprets `-t TEMPLATE` as "treat the template as a
suffix". On Mac the behaviour silently differs.

**Workaround:** spell the full path yourself:
`mktemp "${TMPDIR:-/tmp}/prefix.XXXXXX"`.

**Surfaced by:** Story 8.4 P6 review patch ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-6 — `[ -d .git ]` is false in a linked worktree

**Naive intuition:** `[ -d .git ]` is the canonical "am I in a git repo"
probe.

**Actual behaviour:** in a linked worktree created by `git worktree add`,
`.git` is a *regular file* containing `gitdir: /path/to/main/.git/worktrees/<name>`, not a directory. `[ -d .git ]` returns false; the
script no-ops or misclassifies the location.

**Workaround:** use `git rev-parse --is-inside-work-tree >/dev/null 2>&1`.

**Surfaced by:** Story 8.4 P5 review patch ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-7 — `JSON.stringify` throws on BigInt / circular refs / throwing `toJSON`

**Naive intuition:** `JSON.stringify(value)` returns a string or
`undefined`; it never throws.

**Actual behaviour:** it throws `TypeError` on `BigInt` values
(`TypeError: Do not know how to serialize a BigInt`), on circular
references, and on any `toJSON` getter that itself throws. If the
caller's payload has any of these and the stringify is not in a
try/catch, the surrounding component crashes React's render boundary.

**Workaround:** wrap any `JSON.stringify` over caller-supplied data
in try/catch and degrade to a sentinel string:

```ts
let serialized: string;
try {
  serialized = JSON.stringify(value);
} catch (e) {
  serialized = `[unserializable: ${(e as Error).message}]`;
}
```

This applies to Inspector body previews, "Copy as curl" payload
serialisation, and any future variable-edit JSON-pretty-print path.

**Surfaced by:** Story 8.3 P3 review patch ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-8 — `typeof NaN === "number"` and `typeof Infinity === "number"`

**Naive intuition:** `typeof x === "number"` is the right gate for "x is
a usable HTTP status / count / numeric value".

**Actual behaviour:** `NaN`, `Infinity`, `-Infinity`, and negative
numbers all pass `typeof x === "number"`. An `HTTP NaN` rendered into
the UI is a real consequence (`new FlowableError(_, NaN)` happened in
test fixtures).

**Workaround:** validate the predicate you actually want:

```ts
if (Number.isFinite(raw) && raw >= 0) { /* usable */ }
```

For HTTP status specifically, also gate `raw <= 599` (or `< 1000` if
allowing the `status: 0` network-error sentinel).

**Surfaced by:** Story 8.2 P3 review patch ([Epic 8 retro §3.1](../_bmad-output/implementation-artifacts/epic-8-retro-2026-05-24.md#31-spec--implementation-deviations-multiplied-eight-across-four-stories)).

## RC-9 — `File.text()` does not resolve under jsdom + `userEvent.upload`

**Naive intuition:** in a browser-tier (or jsdom-tier) test, `await file.text()` on a `File` constructed in JS returns the file contents.

**Actual behaviour:** under jsdom, the `File` polyfill exposes a `text()` method
that returns a `Promise` which **never resolves** when the file was attached
via `@testing-library/user-event`'s `userEvent.upload(input, file)`. The
upload helper stashes the file in `input.files` correctly but does not run
the spec-prescribed read-the-blob path; downstream consumer code that does
`await file.text()` hangs the test until the harness timeout. The failure
surfaces as a test that never resolves rather than a clear assertion error.

**Workaround:** shim `File.prototype.text` (or the specific instance) before
attaching:

```ts
const file = new File([content], "process.bpmn", { type: "application/xml" });
Object.defineProperty(file, "text", {
  value: () => Promise.resolve(content),
});
await userEvent.upload(input, file);
```

This applies to all upload-modal tests (`UploadDeploymentModal`,
future task-attachment modals) that read file contents in the same
component as the upload.

**Surfaced by:** Story 9.2 F-2 review patch ([Epic 9 retro §3.1](../_bmad-output/implementation-artifacts/epic-9-retro-2026-05-25.md)).

## RC-10 — TanStack Router test-mount requires an explicit Router harness for components using routing hooks

**Naive intuition:** rendering a component with `render(<Component />)` works
even if the component calls `useNavigate()` / `useRouter()` / `useLoaderData()`
— the router will no-op or fall back to a default.

**Actual behaviour:** TanStack Router's hooks throw `Invariant failed:
useRouter must be used within a RouterProvider` when there is no enclosing
provider. The test-mount fails at the top of the component before any
assertion can run; the error message is helpful, but the workaround
boilerplate is non-trivial to reconstruct from memory each time.

**Workaround:** extract or inline a `renderWithRouter()` helper that wires
`createMemoryHistory + createRootRoute + createRouter + RouterProvider`:

```ts
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";

function renderWithRouter(ui: React.ReactElement) {
  const root = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}
```

Use this for any component test where the component (directly or via a
deep child) calls a TanStack Router hook. The instance-detail panel
tests, modal triggers wired with `Link`, and the row-action navigation
tests all need it.

**Surfaced by:** Story 9.6 F-2 review patch ([Epic 9 retro §3.1](../_bmad-output/implementation-artifacts/epic-9-retro-2026-05-25.md)).

## RC-11 — Flowable job IDs are scoped to per-type namespaces, not the `/management/jobs` root

**Naive intuition:** every Flowable job — executable, timer, dead-letter — can be acted on via `POST /management/jobs/{id}`. The `{action: "..."}` body verb varies by intent; the URL is uniform.

**Actual behaviour:** Flowable 7.x keeps three separate URL namespaces, and job IDs do NOT cross-resolve. A `POST /management/jobs/{timerId}` returns 404 — Flowable refuses to look up a timer ID under the executable-jobs path. Each namespace also accepts only a subset of action verbs:

| Namespace | List | Action verbs | Stacktrace endpoint |
|---|---|---|---|
| Executable | `GET /management/jobs` | `{action: "execute"}` | `GET /management/jobs/{id}/exception-stacktrace` |
| Timer | `GET /management/timer-jobs` | `{action: "move"}`, `{action: "reschedule", dueDate: <iso>}` | `GET /management/timer-jobs/{id}/exception-stacktrace` |
| Dead-letter | `GET /management/deadletter-jobs` | `{action: "move"}` | `GET /management/deadletter-jobs/{id}/exception-stacktrace` |

The "fire timer now" recipe is `{action: "move"}` on the timer-jobs endpoint — moves the timer to the executable queue for immediate async-executor pickup. The timer-jobs endpoint REJECTS `{action: "execute"}` with 400. The operator-feel label ("Execute now") and the wire-level verb (`move`) deliberately diverge (see CLAUDE.md "Operator-feel UI labels can diverge from wire-level action verbs").

**Workaround:** use the namespace-specific wrappers in [src/api.ts](../src/api.ts) (`executeJob` / `executeTimerJob` / `rescheduleTimerJob` / `moveDeadLetterJob` plus `jobStacktrace` / `timerJobStacktrace` / `deadLetterJobStacktrace`), never the bare `/management/jobs/{id}` path. The handler-side pattern is **tab-aware action-verb dispatch** (CLAUDE.md): branch on the active tab's URL search-param before picking the wrapper. Example from `handleExecute` in [src/routes/jobs/index.tsx](../src/routes/jobs/index.tsx):

```ts
if (type === "timer") await api.executeTimerJob(j.id);
else await api.executeJob(j.id);
```

**Surfaced by:** Story 12.2 review patch — timer-job namespace surprise caught during live-engine probe before declaring "real Execute handler" done ([Epic 12 retro §4.1](../_bmad-output/implementation-artifacts/epic-12-retro-2026-05-25.md)).

---

## RC-12 — `/history/historic-variable-instances` nests the variable payload under `variable.{name,type,value,scope}`

**Naive intuition:** historic variables follow the same flat shape as the runtime variable endpoint (`/runtime/process-instances/{id}/variables`) — top-level `name`, `type`, `value`, `scope` fields next to `processInstanceId` / `taskId`. The historic envelope just adds timestamps; the variable bits stay flat.

**Actual behaviour:** Flowable 7.x wraps the variable payload in a nested `variable` object. The row carries only the row-level metadata (`id`, `processInstanceId`, `taskId`, `executionId`, `processInstanceUrl`) at the top level; the variable bits live one level deeper:

```json
{
  "id": "846acaed-5882-11f1-9961-be503a495712",
  "processInstanceId": "846acaec-5882-11f1-9961-be503a495712",
  "taskId": null,
  "executionId": "846acaec-5882-11f1-9961-be503a495712",
  "variable": {
    "name": "initiator",
    "type": "string",
    "value": "rest-admin",
    "scope": "global"
  }
}
```

Reading `entry.variableName` (the runtime-endpoint shape) yields `undefined` and the cell renders blank — a silent failure that's invisible until the operator notices an empty column.

**Workaround:** the typed DTO is `FlowableHistoricVariable = { id, processInstanceId?, taskId?, executionId?, variable: FlowableHistoricVariableValue }` where `FlowableHistoricVariableValue = { name, type?, value, scope? }`. Render code reads `entry.variable.name` / `entry.variable.type` / `entry.variable.value`. See [src/api.ts](../src/api.ts) `FlowableHistoricVariable` and [src/routes/history/index.tsx](../src/routes/history/index.tsx) variables-tab render.

The runtime-variable endpoint at `/runtime/process-instances/{id}/variables` keeps the flat shape (`FlowableVariable = { name, type, value, scope }` returned as a top-level array). Only the historic surface nests.

**Surfaced by:** Story 13.3 follow-up (post-merge operator catch) — the variables tab rendered blank Variable / Type cells against a real Flowable 7.x engine; fixed in the same PR (commits `b533823` + `8085658` shipped the buggy assumption, the follow-up commit fixes the DTO + render).

---

## RC-13 — `/history/historic-process-instances/{id}` is created EAGERLY at start, not lazily at end

**Naive intuition:** the historic surface only knows about an instance once it has ENDED. `GET /history/historic-process-instances/{id}` 404s for a currently-running instance; the historic record appears only after the engine archives the lifecycle.

**Actual behaviour:** Flowable 7.x writes the historic record the moment the instance starts. `GET /history/historic-process-instances/{id}` returns 200 with the full historic shape — `startTime`, `processDefinitionId`, `businessKey`, etc. — even while the instance is still running. The only signal that the instance is still alive is `endTime: null` / `durationInMillis: null`.

This means:
- The runtime panel's status-aware error-probe (404 → null → empty state) and the historic panel's 404 → empty state probe handle DIFFERENT cases. The runtime probe fires when the instance has ended (engine drops the runtime row). The historic probe never fires for a normally-running instance — it only fires for never-existed or admin-purged ids.
- E2E tests that assume "running instance ⇒ historic 404" against a real engine will fail. Use the badge tone instead: a running instance gets the `historic` (warn) badge with `endTime: "—"`; an ended instance flips to the `ended` (mute) badge with `endTime` populated.

**Workaround:** treat the historic panel's `endTime`-missing case as "this is a snapshot of an instance currently in flight" rather than as a "no historic record" path. The `<InstanceHistoricPanel>` already does this via the warn/`historic` badge. Render code that wants to gate on "instance has truly ended" should check `h.endTime != null` rather than `historic.data != null`. E2E assertions should target the badge element (`.badge[data-tone="mute"]` for ended, `.badge[data-tone="warn"]` for in-flight) — not the bare text "ended" / "historic", which collides with the `<td>Ended</td>` row label under Playwright's case-insensitive substring match.

**Surfaced by:** Story 13.1 post-PR E2E run (2026-05-26) — the dual-fetch spec's "running instance ⇒ historic panel empty state" assertion failed because the historic record was populated; the panel was already rendering the in-flight badge correctly (matching the spec author's "endTime unpopulated — uncommon but possible" branch), but the test's empty-state assertion was the wrong contract for a running-instance shape.

---

## RC-14 — Use `/history/historic-activity-instances?finished=false` for "what's running NOW" on parallel-branch instances

**Naive intuition:** the runtime process-instance DTO's `activityId` field carries the activity the instance is currently sitting on. Render it as the Activity column in `/instances` and as the Activity row inside `<InstanceRuntimePanel>`.

**Actual behaviour:** the runtime DTO carries a SINGLE lead `activityId` per instance — useful for linearly-progressing instances, but for instances with parallel branches (parallel gateway, inclusive gateway with multiple active paths, multi-instance subprocess, event-based gateway with multiple waiting handlers), the engine cannot pick one lead and the field is often `null`. Operator-visible instances rendering `"—"` for Activity is the bug shape.

The supported recipe for "what activities are running RIGHT NOW on this instance" lives in the historic surface with a `finished=false` filter:

```
GET /history/historic-activity-instances?processInstanceId={id}&finished=false&size=200
```

This is a cross-namespace recipe — a runtime question answered via the historic endpoint. The result is the full set of active activities (each with `activityId`, `activityName`, `activityType`, `assignee`, `startTime`). The runtime namespace does NOT expose an equivalent.

**Workaround:** use `api.listHistoricActivities({ processInstanceId, finished: false, size: 200 })` (already in [src/api.ts](../src/api.ts)). The `<InstanceActiveActivitiesPanel>` ([src/components/InstanceActiveActivitiesPanel.tsx](../src/components/InstanceActiveActivitiesPanel.tsx)) renders the result as a 4-column table (Activity / Type / Assignee / Started). On the `/instances` list, the Activity column reads from a parallel "active activities" lookup keyed by instance id — falling back to `"—"` only when truly no rows come back.

The runtime DTO's `activityId` field is still useful as a *hint* (single lead activity for linearly-progressing instances) but it is not the source of truth. Future stories that ask "what's CURRENTLY happening on this entity" should evaluate whether the answer lives in `/runtime/*` (the obvious choice) or `/history/*?finished=false` (the surprising choice). The general rule: Flowable's runtime and historic surfaces are designed independently; symmetry is not guaranteed even where the entity is conceptually the same.

**Surfaced by:** Story 13.1 post-closure scope expansion (`78b323a`, 2026-05-26) — the live-engine walkthrough showed Activity columns rendering `"—"` for any instance with a parallel branch; the fix added the 8th panel-as-sibling consumer and the cross-namespace recipe ([Epic 13 retro §4.2](../_bmad-output/implementation-artifacts/epic-13-retro-2026-05-26.md)).

---

## RC-13 — DMN rule cells are JUEL, not FEEL

**Naive intuition:** Flowable's DMN engine speaks the DMN spec's S-FEEL — the language the dmn-js modeler renders rules in, the language ranges like `[18..65]` belong to, the language Camunda's DMN engine evaluates.

**Actual behaviour:** Flowable evaluates `<inputExpression>`, `<inputEntry>`, and `<outputEntry>` text as **JUEL** (JSR-245 Jakarta EE Unified EL). DMN S-FEEL is NOT supported. The engine wraps each input cell internally as `#{<input-var> == <cell-text>}` and JUEL-parses; FEEL constructs that are not valid JUEL syntax fail with a `javax.el` parser error mid-evaluation. The audit trail (`/dmn-history/historic-decision-executions/{id}/auditdata`) shows the symptom clearly:

```json
"ruleExecutions": {
  "2": {
    "valid": false,
    "conditionResults": [{ "id": "ru2i1",
      "exception": "Error parsing '#{score == [50..80)}': syntax error at position 11, encountered '[', ..." }]
  }
},
"failed": true,
"decisionResult": []
```

Note that **rule 1 may have its condition match (`>= 80` is valid JUEL unary syntax)** yet the OVERALL execution still aborts on the broken rule 2 → `decisionResult: []` is empty. This is silent on the wire: HTTP 200, just an empty result array. A `dmn-rule/execute` POST that returns `{"resultVariables":[]}` against an input that obviously matches a rule is the signature.

Affected constructs (from the migration guide):
- Ranges: `[18..65]`, `(0..100]`, etc.
- Comma-list alternatives: `"employed","self-employed"`
- The `not(...)` operator
- The `-` "any" cell (use empty cells instead)
- All FEEL temporal literals (`date(...)`, `duration(...)`)
- FEEL quantifiers (`some x in L satisfies ...`)
- 1-indexed string built-ins (`substring`, `string length`)

Unary tests (`< 100`, `>= 0`, `"gold"`) and bare quoted strings / numbers DO work in Flowable's JUEL parser.

**Workaround:** rewrite per the [FEEL → JUEL migration guide](dmn-feel-to-juel-migration.md). Wrap every `${...}` expression in `<![CDATA[...]]>` to avoid XML escaping pitfalls. The `dmnReadableNameFromFilename` / `extractDefinitionsIdAndName` / `rewriteDefinitionsIdAndName` helpers in [src/modeler/DmnModeler.tsx](../src/modeler/DmnModeler.tsx) handle the `<definitions>` rewrite at deploy time; rule-cell rewriting is currently manual (the dmn-js modeler authors FEEL syntax by default — operators editing in the UI must hand-translate ranges/list-alternatives to JUEL or pre-translate the XML before deploy).

```xml
<!-- before (FEEL) -->
<rule id="rr2">
  <inputEntry id="rr2i1"><text>[700..800)</text></inputEntry>
  <inputEntry id="rr2i2"><text>&gt;= 60000</text></inputEntry>     <!-- unary, keep -->
  <outputEntry id="rr2o1"><text>"B"</text></outputEntry>
</rule>

<!-- after (JUEL) -->
<rule id="rr2">
  <inputEntry id="rr2i1"><text><![CDATA[${creditScore >= 700 && creditScore < 800}]]></text></inputEntry>
  <inputEntry id="rr2i2"><text>&gt;= 60000</text></inputEntry>
  <outputEntry id="rr2o1"><text>"B"</text></outputEntry>
</rule>
```

When the source is a TypeScript template literal (e.g. [src/modeler/starters.ts](../src/modeler/starters.ts)'s `LOAN_DMN_XML`), escape the `$` as `\${...}` so the JUEL marker survives JS interpolation.

**Surfaced by:** 2026-05-27 review — the operator flagged that the loan-eligibility starter and the sample.dmn e2e fixture were authored in FEEL syntax. Live audit-trail probe confirmed silent execution failures; rewrite landed in the same session.

---

## How to extend this file

When a review surfaces a runtime quirk that meets all three of:

1. The naive intuition would have produced the wrong code.
2. The quirk is general enough to recur (not story-specific).
3. The workaround is shorter than the explanation of why it's needed.

…add an entry. Follow the **naive intuition → actual behaviour →
workaround → surfaced by** structure above. Keep the workaround
concrete (a code snippet or a one-line command), not abstract.

Cap each entry at ~150 lines or so — the file is meant to be skimmable
during spec authoring, not exhaustive.
