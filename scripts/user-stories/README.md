# User-stories tooling

Keeps `docs/specifications/user-stories/` and the GitHub issue tracker in sync.

## How it fits in Flowatch's flow

```
  BMad skill produces                 sync-user-stories.sh                GitHub issues
  epics/stories as local              + import_issues.py                  (source of truth
  markdown files          ────────►   pushes them up        ────────►    for state, labels,
                                                                          comments, PRs)
  docs/specifications/                                                    github.com/syalioune/
  user-stories/                                                            flowatch/issues
```

- **`bmad-create-epics-and-stories`** (BMad skill) writes the initial epic + story tree into `docs/specifications/user-stories/` and a CSV under the same dir.
- **`scripts/user-stories/import_issues.py`** ingests that CSV and creates the matching GitHub issues, applying labels, milestone, and persona from the file. **Idempotent on re-runs**: matches each row to an existing issue by the story-identifier prefix in the title (e.g. `FND-SYS-006`) and updates it in place instead of creating duplicates.
- **`scripts/user-stories/sync-user-stories.sh`** keeps the two halves aligned afterward — reports drift in CI, bootstraps stub files for issues that don't have a matching local file, lists orphans.

After import, GitHub issues are the source of truth for **state, labels, comments, PRs, ACs as completed**. Local files remain the source of truth for **the curated story body** (the hand-edited narrative). Because the importer is idempotent, regenerating the CSV from edited markdown and re-running `import_issues.py` is a valid way to push body/label/milestone edits back to existing issues — though it does not change issue state, comments, or PRs.

## Filename convention (Flowatch-specific)

```
<AREA>-<PERSONA>-<SEQ>_<Title_With_Underscores>.md
```

| Token | Examples |
|---|---|
| `<AREA>` | `MDL` (Modelers), `DPL` (Deployments), `RUN` (Runtime/Tasks), `JOB` (Jobs/Batches/Events), `HST` (History), `IDT` (Identity/Tenants), `INS` (API Inspector), `AUT` (Authentication), `DSY` (Design System), `NAV` (Routing/Navigation), `API` (REST contract), `QGT` (Quality Gates / Tests), `FND` (Foundation / Build), `DOC` (Documentation), `I18N` (i18n / a11y) |
| `<PERSONA>` | `MIR` (Mira — operator, P1), `DAA` (Daan — evaluator, P2), `SAS` (Sasha — admin-script-author, P3), `SYS` (system-only — no human persona) |
| `<SEQ>` | Zero-padded 3-digit sequence within the area-persona combination (`001`, `002`, …) |

Example: `RUN-MIR-007_Diagnose_a_stuck_job.md` (Mira's 7th story in the Runtime area).

Many-to-one is allowed: a single `<AREA>-<PERSONA>-<SEQ>` PREFIX may correspond to multiple issues if a single user story produced multiple tickets. Each issue still gets its own file derived from its own title.

## Persona reference (mapped from PRD §5)

| Trigram | Persona | Profile |
|---|---|---|
| `MIR` | Mira | Flowable 7+ OSS operator — primary audience |
| `DAA` | Daan | Tech lead evaluating Flowable vs. Camunda/Operaton |
| `SAS` | Sasha | Internal admin-tool author — REST-API onboarding |
| `SYS` | System | Pure infrastructure / tooling work, no human persona |

## Scripts

| Script | Purpose | When to use |
|--------|---------|-------------|
| [`sync-user-stories.sh`](./sync-user-stories.sh) | Validate that every `type:user-story` issue has a local file (and vice versa); bootstrap missing stubs from issue bodies; list orphans. | Routine — every session, on CI, after filing/closing an issue. |
| [`import_issues.py`](./import_issues.py) | **Idempotent** import of a CSV-formatted backlog into GitHub issues. Matches existing issues by the title prefix (`AREA-PERSONA-SEQ`) and updates them in place; creates issues for prefixes not yet seen. See [`github_importer_readme.md`](./github_importer_readme.md). | Initial repo bootstrap, **and** to push CSV-driven edits (body, labels, milestone) back to existing issues. |
| [`transform_user_stories.py`](./transform_user_stories.py) | Convert hand-written user-story markdown into the import-ready CSV. | Run before `import_issues.py` whenever the markdown has changed and you want to propagate edits to GitHub. |

The bash sync script (`sync-user-stories.sh`) is the **ongoing GitHub → local** mechanism (tracks new issues, renames, orphans). The two Python scripts together provide the complementary **local → GitHub** path: regenerate the CSV with `transform_user_stories.py`, then re-run `import_issues.py` to apply the changes — safe to repeat because the importer dedupes by title prefix.

## Quick reference — `sync-user-stories.sh`

Three Make targets wrap the script. Always invoke via Make so the working directory and gh/jq dependencies are already configured.

| Make target | Mode | Effect | Exit code |
|-------------|------|--------|-----------|
| `make user-stories-check` | `check` | Validate alignment. Reports missing files, stale-title files, and orphans. **Mutates nothing.** | `0` if in sync, `1` on drift. CI-friendly. |
| `make user-stories-bootstrap` | `bootstrap` | Create stub files for issues that have no local file. **Embeds the issue body verbatim** under a metadata header (Persona / Issue / State / Milestone / Labels). Never overwrites or deletes. | `0` always. |
| `make user-stories-prune-list` | `prune-list` | Print `rm` commands for local files with no matching issue. **Does not delete** — manual review required. | `0` always. |

### Filename ↔ GitHub issue title

```
<PREFIX>_<Title_With_Underscores>.md
```

Where:

- `<PREFIX>` matches the regex `^[A-Z][A-Z0-9]*(-[A-Z][A-Z0-9]*)*-[0-9]+`. For Flowatch, the canonical shape is `<AREA>-<PERSONA>-<SEQ>` (see the *Filename convention* table above). The trailing segment must be numeric — placeholders like `RUN-MIR-XXX` are rejected.
- `<Title_With_Underscores>` is the issue's title after the prefix, with whitespace replaced by `_` and `/` replaced by `-`. Parentheses, ampersands, dashes, dots, percent signs are kept verbatim.

Example mapping:

| Issue title | Filename |
|-------------|----------|
| `RUN-MIR-001: Diagnose a stuck job` | `RUN-MIR-001_Diagnose_a_stuck_job.md` |
| `MDL-MIR-002: Deploy BPMN from "new from scratch"` | `MDL-MIR-002_Deploy_BPMN_from_"new_from_scratch".md` |
| `IDT-SAS-003: Add user to group via Identity screen` | `IDT-SAS-003_Add_user_to_group_via_Identity_screen.md` |
| `INS-DAA-001: Inspector evaluates Flowatch + Flowable as a package` | `INS-DAA-001_Inspector_evaluates_Flowatch_+_Flowable_as_a_package.md` |

### Many-to-one prefix mapping

A single PREFIX can legitimately map to multiple issues — a single user story can spawn multiple tickets (one per implementation slice, or one for docs + one for tests). Each issue gets its own filename derived from its own title; the script handles this correctly.

### Drift categories

| Category | Meaning | How to fix |
|----------|---------|------------|
| **Missing file** | Issue exists; no file with the expected name exists. | Run `make user-stories-bootstrap`. |
| **Stale title** | A local file shares a prefix with some open/closed issue, but its filename doesn't match any of that prefix's issues' canonical filenames. Usually means the issue title was edited in GitHub. | `git mv <current> <expected>`. The script emits the exact command in the report. |
| **Orphan** | Local file with a prefix not used by any GitHub issue. | Either file an issue (via `/new-feature`) or `git rm` after review. |
| **Prefix-less issue** | Issue title doesn't start with a recognized PREFIX — informational only, not drift. | Edit the issue title in GitHub: `gh issue edit <NUM> --title "<PREFIX> <title>"`. |

### What `bootstrap` writes

For each missing issue, `bootstrap` calls `gh issue view <number> --json body --jq '.body // ""'` and produces a file with this layout:

```markdown
# <PREFIX>: <pure title>

> **User Story ID**: <PREFIX>
> **Persona**: <inferred from PREFIX trigram, e.g. "Mira (operator)" for *-MIR-*, "Daan (evaluator)" for *-DAA-*>
> **Issue**: <URL>
> **State**: <OPEN | CLOSED>
> **Milestone**: <title>
> **Labels**: <comma-separated>

<!-- import notice — hand-edits preserved across subsequent runs -->

<issue body verbatim>
```

If the issue has no body, a minimal "As X, I want Y" scaffold replaces the body section.

### Boundaries (what the script intentionally does NOT do)

- **No regeneration of existing files.** Bootstrap only creates files that don't exist. Hand-curated edits to story files are safe — re-running bootstrap will not clobber them.
- **No pushing local changes back to GitHub.** Editing a local user-story file does not retitle the issue or update its body. If you change content, mirror the change in GitHub manually.
- **No automatic deletion.** `prune-list` emits commands but never deletes; `check` and `bootstrap` never remove anything.
- **No format conversion.** The local file gets the issue body verbatim. Reshaping the body into a different summary format is a hand-editing task — out of scope for the script.

### CI hook (suggested)

To gate PRs on user-story sync, add to a GitHub Actions workflow:

```yaml
- name: Validate user-stories sync
  run: make user-stories-check
```

The job will fail when an issue is filed without a corresponding local file, or when an issue title is edited without the file being renamed.

### Troubleshooting

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `gh CLI required` | gh not installed in the shell. | Install: <https://cli.github.com/>. |
| `not authenticated` | gh has no token for this repo. | `gh auth login`. |
| Empty output / silent exit | Likely a regression in error handling under `set -euo pipefail`. | Run `bash -x scripts/user-stories/sync-user-stories.sh check` to trace. |
| Lots of "stale title" entries after a release | Common after a milestone closure where many issue titles were renamed (e.g. adding `(legacy)`). | Review each, run the suggested `git mv`, commit as `chore(docs): rename user-story files for canonical filenames`. |
| Bootstrap fetches an empty body | Issue body really is empty in GitHub. | Either fill in the issue's body upstream and re-run bootstrap (the file already exists, won't be overwritten — delete it first to re-bootstrap), or edit the local stub directly. |