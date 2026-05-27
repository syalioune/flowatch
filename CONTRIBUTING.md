# Contributing to Flowatch

Thanks for considering a contribution. Flowatch is the OSS GUI for Flowable 7+ — a community project filling the UI gap left when Flowable removed the bundled web app in 7.0.

## Before you start

- Read [README.md](README.md) for the project's positioning and scope.
- Read [CLAUDE.md](CLAUDE.md) for the repo's conventions (live API only, no mocks, no telemetry, no CDN fonts).
- Read [project-context.md](https://github.com/syalioune/flowatch-bmad/blob/main/_bmad-output/project-context.md) (private repo — maintainer access) for the load-bearing engineering rules.
- Check [docs/compat.md](docs/compat.md) before working on a feature that touches the Flowable REST API — some 6.x features are not exposed in 7.x OSS.

## How to contribute

1. **File an issue first** for anything beyond a typo fix. Use the relevant template under `.github/ISSUE_TEMPLATE/`. Bugs go to **🐛 Bug report**; ideas go to **✨ Feature request** (well-defined) or **📝 RFC** (needs discussion); user-facing stories use **🧑‍💻 User Story**.
2. **Wait for triage.** The maintainer will label the issue (`area:*`, `priority:*`, `release:*`) and either accept it (`state:ready`) or request changes.
3. **Open a PR** referencing the issue (`Closes #N` in the PR description). The PR template prompts for acceptance-criteria mapping, traceability, and test evidence.
4. **All commits must follow Conventional Commits 1.0.** PRs with non-conforming commits are blocked by CI. See [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) and the scope rules in [release.config.mjs](release.config.mjs).
5. **PRs require a passing CI run** (check / unit / e2e / build) and a maintainer approval.

## Development setup

See [DEVELOPERS.md](DEVELOPERS.md). Maintainers cutting a release should follow [docs/release-runbook.md](docs/release-runbook.md) for the step-by-step procedure.

Quick start:

```bash
git clone https://github.com/syalioune/flowatch.git
cd flowatch
bash scripts/dev/run-dev.sh       # starts Docker stack + Vite dev server
```

## Commit conventions

| Type | When | Notes |
|------|------|-------|
| `feat` | New user-visible capability | Auto-bumps minor version on release |
| `fix` | Bug fix | Auto-bumps patch version |
| `perf` | Performance improvement | Patch |
| `refactor` | Code structure, no behavior change | Patch |
| `test` | Test additions / fixes | Not released-on |
| `docs` | Docs only | Not released-on (unless the README) |
| `ci` | CI workflows / Dependabot | Not released-on |
| `chore` | Maintenance, deps, formatting | Not released-on |
| `build` | Build system / Docker / Vite config | Not released-on |
| `style` | Code style (Biome auto-fixes) | Hidden from changelog |

Breaking changes: append `!` after the type (e.g. `feat(api)!: drop /repository/forms`) and add a `BREAKING CHANGE:` footer.

Scopes are project-defined — see [release.config.mjs](release.config.mjs) for the canonical theme mapping. New scopes should be validated via `node scripts/release/check-scope.mjs <scope>` before merging so they land in the right release-notes section.

Every commit message must also include a `Signed-off-by: Name <email>` trailer ([DCO](https://developercertificate.org/)); the `commit-msg` hook blocks unsigned commits. Use `git commit -s` to add the trailer automatically.

### Pre-commit hook behavior

When you run `git commit`, two hooks fire in order:

1. **`.husky/pre-commit`** — runs `npx --no-install biome format --write .` against
   the whole working tree, then re-stages tracked-file changes via `git add -u`.
   Auto-formatting is silent for clean code; misformatted files are corrected
   and re-staged transparently.

2. **`.husky/commit-msg`** — runs `commitlint` against your message to enforce
   [Conventional Commits](https://www.conventionalcommits.org/) **and the DCO
   `Signed-off-by` trailer**. A bad message blocks the commit; the formatter's
   already-done work stays on the working tree (just not committed).

Known behavior to be aware of:

- The hook formats the **whole working tree**, not just staged files. If you
  have work-in-progress edits in addition to staged changes, those WIP edits
  will also be formatted (and `git add -u` will re-stage modifications to
  already-tracked files — but never new untracked files). To commit only
  your staged hunks pristinely, `git stash --keep-index` before committing.

- The hook needs `node_modules/@biomejs/biome` installed. If missing, the hook
  exits non-zero with `✗ Biome formatter failed. Run 'npm install' if biome
  is missing.` and blocks the commit.

- The hook chain depends on `core.hooksPath` pointing at `.husky/_`. Husky's
  `prepare` script (`npm install` runs it automatically) configures this. If
  hooks aren't firing after a fresh clone, run `npx husky` once to re-init.

- `git commit --no-verify` skips **both** the format pass and the Conventional
  Commits / DCO check. Use this **only** for genuine Biome bugs (and file an
  upstream issue) — never to bypass formatting because you disagree with the
  style. If a Biome rule fights with project conventions, raise it as a PR
  against `biome.json` instead.

## Pattern P-001 enforcement (fetch funnel)

Every Flowable REST call must go through `request()` in [src/api.ts](src/api.ts) (the funnel that populates `API_LOG` and dispatches the `api:log` event the Inspector listens to). A direct `fetch()` call anywhere else makes the Inspector go blind for that call — operators relying on the live REST log lose visibility. CI enforces this via [scripts/ci/check-fetch-funnel.sh](scripts/ci/check-fetch-funnel.sh).

Run the check locally:

```bash
npm run check:p-001
```

The script greps for `fetch(` in `src/**/*.ts(x)`, allowlists `src/api.ts`, and ignores any line carrying a `p-001-allow` comment. The escape-hatch comment is only acceptable when the `fetch(` token is inside a **string literal** (the canonical example is `buildFetchSnippet`'s template literal in `src/components.tsx` — the snippet text shown in the Inspector's "Try it" tab) or JSX text content (the "fetch()" tab label). Both `// p-001-allow` (JS context) and `{/* p-001-allow */}` (JSX text context) are accepted. Adding the comment to bypass enforcement on an actual `fetch()` call is grounds for a code-review block.

Failing CI output looks like:

```
✗ src/screens.tsx:42:  return await fetch(url);

1 violation(s) — every fetch() call must funnel through src/api.ts (Pattern P-001). See CONTRIBUTING.md.
```

Pattern P-001 is documented in the private companion repo `flowatch-bmad` (architecture.md §P-001) — public-facing rationale is the one-paragraph summary above: every REST call must go through `request()` so the API Inspector reflects the truth of what the app is doing.

## What goes where

| You want to… | Open this template | Land it in… |
|---|---|---|
| Report a bug | 🐛 Bug report | `area:<closest>`, severity tag |
| Propose a feature | ✨ Feature request | `release:*` milestone |
| Discuss an open design question | 📝 RFC / Proposal | No code yet |
| Document something | 📚 Documentation | `area:docs` |
| File a user story | 🧑‍💻 User Story | `release:0.0.2` or later |
| Refactor / cleanup | 🧹 Chore | `type:chore` |
| Add tests | ✅ Integration Tests / 🧩 E2E Tests | `area:tests` |

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Security

Don't open public issues for security bugs. See [SECURITY.md](SECURITY.md) for the private reporting channel.

## License

Apache-2.0. Contributions are licensed under the same terms.
