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
