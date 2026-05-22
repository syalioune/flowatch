# Flowatch release runbook

<!-- SPDX-License-Identifier: Apache-2.0 -->

Mechanical procedure. Top-to-bottom. Zero judgement calls. Each section is either a copy-pasteable command block (with an Expected output snippet) or a binary decision tree. Conceptual background lives in [DEVELOPERS.md §3](../DEVELOPERS.md) and [ADR-011](../_bmad-output/planning-artifacts/architecture.md#adr-011--release-pipeline-conventional-commits--semantic-release); this file is the operational layer below them.

## 1. Pre-flight checklist

Run through this list **before** doing anything else. Every box must be ticked. Refresh refs first so the checks query the remote, not a stale local checkout:

```bash
git fetch origin --prune --quiet
export VERSION=0.0.2   # set once, reused throughout the runbook
```

- [ ] `develop` HEAD CI is green: all four required checks (`check`, `unit`, `e2e`, `build`) plus CodeQL (`Analyze (javascript-typescript)`) on the latest commit.
  ```bash
  gh run list --branch develop --limit 1 --json conclusion,headSha,name | jq
  # expect: all conclusions "success" for the most-recent push
  ```
- [ ] No in-flight PRs targeting `develop`.
  ```bash
  gh pr list --base develop --state open
  # expect: empty list (or only PRs intentionally deferred until after this release)
  ```
- [ ] `npx semantic-release --dry-run --no-ci` from develop tip computes a next-version whose `X.Y.Z` prefix matches `$VERSION`. Develop runs on the `beta` channel, so output reads `X.Y.Z-beta.N` — verify the `X.Y.Z` portion equals `$VERSION`. A mismatch means a `feat!:` or similar landed and bumped major/minor unexpectedly.
  ```bash
  HUSKY=0 npx semantic-release --dry-run --no-ci 2>&1 | grep -E 'next release version'
  # expect: "The next release version is $VERSION-beta.N" (e.g. "0.0.2-beta.3")
  # STOP if the X.Y.Z portion does not match $VERSION.
  ```
- [ ] No `[skip release]` commit is the current HEAD of develop. (Bot-authored commits would interfere with next-release detection.)
  ```bash
  git log -1 origin/develop --pretty=%B | grep -F '[skip release]' && echo "STOP: HEAD is a [skip release] commit" || echo "OK"
  # expect: OK
  ```

**If any box fails, stop. Fix the failing item, then restart this checklist from the top.**

## 2. Cut the release branch

```bash
git switch develop
git pull --ff-only origin develop
# If pull --ff-only aborts ("Not possible to fast-forward"): local develop has diverged.
# After confirming no local work is at risk:
#   git reset --hard origin/develop

# Cut the release branch from develop's tip.
git switch -c release/$VERSION
git push -u origin release/$VERSION
```

**Expected output (last command), two lines:**
```
Branch 'release/0.0.2' set up to track 'origin/release/0.0.2'.
 * [new branch]      release/0.0.2 -> release/0.0.2
```

> **What this push triggers.** `release/*` is the `rc` channel in [release.config.mjs](../release.config.mjs), and [release.yml](../.github/workflows/release.yml) fires on `push: release/*`. Within ~3 min the workflow publishes `v$VERSION-rc.1` (paused at the `release-bot` approval gate — see §4). The RC release is expected — do not treat it as a failure. Last-mile fixes during stabilization land on `release/$VERSION` via PR and produce `rc.2`, `rc.3`, …

> **Protection posture.** `release/*` branches are **not** protected by [scripts/bootstrap-gh/protect-branches.sh](../scripts/bootstrap-gh/protect-branches.sh) — only `main` and `develop` are. Treat `release/*` as ephemeral, single-maintainer-owned, and don't push hand-edits after the workflow starts unless you mean to publish another `rc`.

## 3. Open the release PR

```bash
# Body template — edit only the milestone link if applicable.
cat > /tmp/release-pr-body.md <<EOF
## Release ${VERSION}

Promotes \`develop\` → \`release/${VERSION}\` → \`main\` per ADR-011.

### Pre-flight
- [x] develop CI green
- [x] §1 dry-run produced a clean next-version
- [x] no in-flight develop PRs

Refs milestone-0.0.1 retro / story 6.5-5 runbook.
EOF

gh pr create \
  --base main \
  --head release/$VERSION \
  --title "chore(release): $VERSION" \
  --body-file /tmp/release-pr-body.md
```

**Expected output:**
```
https://github.com/syalioune/flowatch/pull/<N>
```

**Merge method.** Use **Create a merge commit** (not Rebase, not Squash). [protect-branches.sh](../scripts/bootstrap-gh/protect-branches.sh) allows `["rebase", "merge"]` and blocks squash. Rebase would rewrite the release-branch SHAs and detach any `rc.N` tags already published from their commits; a merge commit preserves the `release/*` history and gives the bot a clean two-parent join on main.

**Sequencing rule (read before merging):** the back-merge `main → develop` (§5) is opened **after** the bot's release commit lands on main, not now. The bot's `chore(release): $VERSION [skip release]` commit (with the CHANGELOG entry and `package.json` bump) lands on **main**, not on the release branch — so the back-merge source is main, and you can only resolve it once that commit exists.

## 4. Semantic-release execution on merge to `main`

When the §3 release PR merges to `main` (or when CI fires on a push to `release/*`), the release workflow runs automatically. It does the following, in order:

0. **Pause at the `release-bot` environment approval gate.** [release.yml](../.github/workflows/release.yml#L41) declares `environment: release-bot`, which is configured with a Required reviewer = the maintainer. The workflow halts in **Waiting** state until you click **Review deployments → Approve and deploy** at `https://github.com/syalioune/flowatch/actions/runs/<run-id>` (or Settings → Environments → release-bot → pending deployments). Without approval, secrets never unseal and steps 1–5 never execute. This is not a failure — it is the gate.
1. **Mint Flowatch Release Bot token** ([.github/workflows/release.yml](../.github/workflows/release.yml) — `Mint Flowatch Release Bot token` step). Uses the App credentials stored as Environment secrets on the `release-bot` environment.
2. **Checkout full history** with the bot token (`fetch-depth: 0`, `persist-credentials: true`). semantic-release needs the full git log to compute the next version.
3. **Setup Node from `.nvmrc`** and `npm ci`.
4. **`npm audit signatures`** — verifies registry-signed packages before the bot publishes anything.
5. **Run `npx semantic-release`** — plugins execute in the order documented in ADR-011: `commit-analyzer` → `release-notes-generator` → `changelog` → `npm` → `git` → `github`. The `git` plugin commits `chore(release): X.Y.Z [skip release]` and pushes it to **the branch the workflow ran on** — `main` when triggered by the §3 release-PR merge, `release/$VERSION` when triggered by a push to the release branch (the `rc.N` flow from §2). The release branch is then behind main by that one commit and will be deleted in §5.

**Representative run log (success):**
```
[semantic-release] Loaded plugin "analyzeCommits" from "@semantic-release/commit-analyzer"
[semantic-release] Analysis of 17 commits complete: patch release
[semantic-release] The next release version is 0.0.2
[semantic-release] Created GitHub release v0.0.2
[semantic-release] Published release 0.0.2 on default channel.
```

**Diagnosing a non-progressing run** (decision tree, top to bottom):

```
1. Open Actions → click the running job. Banner reads "Waiting for review"?
     → YES: approve at Settings → Environments → release-bot → pending deployments. Done.
     → NO:  continue.
2. Job log shows "Mint Flowatch Release Bot token" running > 30s?
     → App creds expired or rotated. See §7.1.
3. "Run semantic-release" step elapsed > 5 min with no log output?
     → Plugin hung on a GitHub API call. Cancel run, re-trigger manually (§7.5).
4. None of the above and elapsed > 5 min?
     → Open the failing step's log. Treat as unique failure; check §7 modes.
5. Elapsed < 5 min and no progress for 60s?
     → Network blip; let it ride to the 5-min mark before intervening.
```

## 5. Back-merge `develop ← main`

**After** the release PR (§3) merges to `main` and the bot has pushed `chore(release): $VERSION [skip release]` onto **main**, back-merge `main → develop` **immediately** (within 24h). The bot's commit (the CHANGELOG entry, the `package.json` bump, and the parent of the `vX.Y.Z` tag) lives on main, not on `release/X.Y.Z` — so develop must pull from main. Skipping this leaves develop's ancestry de-synced from the stable tag and the next beta computes its baseline against a stale ancestor.

```bash
# Refresh local refs (picks up the bot's chore(release) commit on main).
git fetch origin --prune
git switch develop
git pull --ff-only origin develop
# Diverged? After confirming no local work: git reset --hard origin/develop

git merge --no-ff origin/main \
  -m "chore(release): back-merge v$VERSION into develop [skip release]"

git push origin develop
```

**Expected output (last command):**
```
   <hash>..<new-hash>  develop -> develop
```

Then delete the release branch:

```bash
git push origin :release/$VERSION
```

**Expected output:**
```
 - [deleted]         release/0.0.2
```

> **Conflicts?** If develop already moved `CHANGELOG.md` or `package.json` (e.g. an out-of-band edit landed between the release cut and the back-merge), resolve normally — keep main's CHANGELOG entry and `package.json` version verbatim. `-s ours` is a recovery strategy for an already-corrupted ancestry (see §7.4), not a routine flag.

## 6. `[skip release]` vs `[skip ci]` — quick reference

Source of truth for `[skip release]`: [.github/workflows/release.yml:33](../.github/workflows/release.yml#L33) `if:` condition. If that marker string ever changes, update this table and every commit-message template in this runbook.

| Marker | Effect | Use when |
|--------|--------|----------|
| `[skip release]` | Suppresses **only** the `release.yml` workflow. CI + CodeQL still run; merge passes required checks. | Bot's own version-bump commit; manual back-merge that must not re-trigger a release. |
| `[skip ci]` | Suppresses **all** workflows including required checks. Branch protection blocks the merge. | Almost never on protected branches. |

**Rule of thumb:** if in doubt, use `[skip release]`.

## 7. Failure recovery

Each failure mode below is a diagnosis + recovery command sequence + a "Prevent recurrence" pointer.

### 7.1 Release job fails after tagging but before publishing

> **Immutability constraint.** GitHub Releases (and the tags backing them) in this repo are **immutable** — `gh release delete`, `gh release edit`, and `git push origin :refs/tags/v$VERSION` all fail. Recovery is forward-only: backfill what's missing or roll the next version forward. Never attempt to rewind a tagged version.

**Diagnosis:**
```bash
gh release view v$VERSION 2>&1 | head -10
# expect (if tag exists but release is missing): "release not found" with the tag still listed in `git ls-remote --tags origin`
git ls-remote --tags origin | grep "v$VERSION"
# expect: one line if the tag was pushed
```

**Recovery path A — tag exists, GitHub Release missing (most common):** publish the Release against the existing tag, then continue the normal flow.
```bash
# Regenerate the release notes from the bot's CHANGELOG entry (or via dry-run).
git fetch origin --tags
git show v$VERSION:CHANGELOG.md | awk "/^## \\[$VERSION\\]/,/^## \\[/" | sed '$d' > /tmp/release-notes-v$VERSION.md

# Re-run the workflow first — usually the cheapest fix.
gh run rerun <run-id>

# If the re-run still cannot publish (token rotation, plugin crash post-tag),
# create the GitHub Release manually against the existing tag:
gh release create v$VERSION --target $(git rev-parse v$VERSION) \
  --title "v$VERSION" --notes-file /tmp/release-notes-v$VERSION.md \
  $([ "${VERSION}" != "${VERSION%%-*}" ] && echo --prerelease)
```

**Recovery path B — tag exists, GitHub Release exists, but bot's `chore(release)` commit failed to push:** the tag and release are correct but `main` is missing the CHANGELOG / `package.json` bump commit. Land it via a hotfix PR (same shape as §7.2) carrying `[skip release]` so `release.yml` does not re-fire.

**Recovery path C — workflow died before tagging:** no tag, no release, no bot commit. Re-run the workflow from the Actions tab; semantic-release will compute the same next-version and complete the run.

```bash
gh run rerun <run-id>
# or, if the run record is gone:
gh workflow run release.yml --ref main   # see §7.5
```

**Never attempt:** `gh release delete v$VERSION --cleanup-tag --yes`, `git push origin :refs/tags/v$VERSION`, `git push --force` against any tag ref. All will fail under immutability rules and the failure modes (partial deletion of the release while the tag remains, or vice-versa) leave the repo in a worse state.

**Prevent recurrence:** §1 pre-flight verifies the dry-run produces a clean next-version, which exposes plugin-error regressions before the release branch is cut.

### 7.2 Changelog footer breaks markdown

**Diagnosis:**
```bash
git switch main
git pull origin main
git show HEAD --stat | grep CHANGELOG.md
# expect: CHANGELOG.md listed in the bot's chore(release) commit
git diff HEAD~1 HEAD -- CHANGELOG.md | head -30
# expect: the new release-notes block; look for unclosed `*`, broken table, etc.
```

**Recovery (hotfix PR — direct push to `main` is blocked by protection):**
```bash
# Branch off main, fix the markdown, push, PR, merge.
git switch main
git pull --ff-only origin main
git switch -c hotfix/changelog-v$VERSION
$EDITOR CHANGELOG.md
git add CHANGELOG.md
git commit -s -m "docs(changelog): fix markdown rendering in v$VERSION notes [skip release]"
git push -u origin hotfix/changelog-v$VERSION

gh pr create --base main --head hotfix/changelog-v$VERSION \
  --title "docs(changelog): fix v$VERSION markdown" \
  --body "Hand-fix for bot-generated CHANGELOG.md after v$VERSION. Carries [skip release] so release.yml does not re-fire."

# After merge, the next §5 back-merge carries the fix into develop along with the rest of main.
```

> **Why not push directly to main?** `main` is protected; `allowed_merge_methods: ["rebase", "merge"]` means PR-based merges only. A direct push returns `protected branch hook declined` unless you toggle Admin bypass in repo settings — don't.

**Prevent recurrence:** §1 pre-flight catches changelog generation errors (`@semantic-release/release-notes-generator` plugin crashes) before the release branch is cut; a broken rendering after a successful generation is rarer but still possible — see ADR-011's themes alignment with `commitlint.config.cjs`.

### 7.3 Wrong base branch was used

**Diagnosis:**
```bash
gh pr view <pr-number> --json baseRefName,headRefName | jq
# expect (mistake): baseRefName != "main" for the §3 release PR
```

**Recovery (PR not yet merged):**
```bash
gh pr close <pr-number> --comment "Wrong base branch; closing and re-opening with correct base."
gh pr create \
  --base main \
  --head release/$VERSION \
  --title "chore(release): $VERSION" \
  --body-file /tmp/release-pr-body.md
```

**Expected output:**
```
https://github.com/syalioune/flowatch/pull/<N+2>
```

**Recovery (PR already merged into the wrong branch):** the recovery depends on which merge method GitHub used (squash is blocked by protection, so it's one of two). If the merge to `main` already triggered `release.yml` and a `vX.Y.Z` tag was created, **stop here** — releases are immutable (see §7.1). The forward-only path is to land the revert + redo §3, accept that the wrong-base release exists in history, and bump to the next version.

```bash
# Inspect the wrong-branch tip to choose the right revert.
git fetch origin --prune
git log origin/<wrong-branch> -3 --oneline --no-decorate

# Case A — Create a merge commit (HEAD shows a merge with 2 parents):
git switch <wrong-branch>
git pull --ff-only origin <wrong-branch>
git revert --mainline 1 <merge-commit-sha>
git push origin <wrong-branch>

# Case B — Rebase and merge (HEAD shows N linear commits, no merge commit):
git switch <wrong-branch>
git pull --ff-only origin <wrong-branch>
git revert --no-edit <oldest-sha>^..<newest-sha>   # the rebased range
git push origin <wrong-branch>

# Then redo §3 with the correct base.
```

> **Note.** The revert push to `main` (Case A or B) lands a normal commit without `[skip release]`, so `release.yml` will fire and re-analyze. Since the reverted feat/fix commits cancel out, semantic-release will conclude "no relevant changes" and not publish — but the workflow will run through the approval gate. Approve to let it complete cleanly.

**Prevent recurrence:** §3's `gh pr create --base main --head release/$VERSION` template makes the base explicit. Following the runbook verbatim closes this failure mode.

### 7.4 Back-merge was forgotten and develop is N commits behind main

**Diagnosis:**
```bash
git fetch origin --prune
git log origin/develop..origin/main --oneline
# expect (forgotten back-merge): one or more commits, including the bot's chore(release) commit
```

**Recovery — undrifted develop:** run §5 verbatim. Idempotent.

**Recovery — develop has already published betas past the missed back-merge:** the normal merge would pull main's CHANGELOG / `package.json` on top of develop's drifted state and `release-notes-generator` would double-count commits on the next beta. Use `-s ours` to record ancestry without copying the tree:

```bash
git switch develop
git pull --ff-only origin develop
git merge -s ours --no-ff origin/main \
  -m "chore(release): record v$VERSION back-merge in develop (-s ours) [skip release]"
git push origin develop
```

This records main as a second parent without altering develop's tree — restoring ancestry without re-introducing the bumps develop has already moved past. Use **only** when develop has drifted; otherwise the regular §5 merge is correct.

**Prevent recurrence:** the pre-flight §1 `git log -1` check on develop's HEAD catches the inverted state (a `[skip release]` commit missing on develop's tip implies the back-merge never ran).

### 7.5 Re-trigger the release workflow manually

When a release run failed transiently (network, API rate limit) and you've cancelled it, re-trigger via `workflow_dispatch` instead of pushing an empty commit:

```bash
gh workflow run release.yml --ref main
# or for an rc cycle:
gh workflow run release.yml --ref release/$VERSION
```

The workflow runs the same approval-gate → mint-token → semantic-release sequence as the push trigger. Confirm the new run shows up:

```bash
gh run list --workflow=release.yml --limit 1
```

> **When NOT to use this.** If the previous run *succeeded* (tag exists, GitHub Release published), `workflow_dispatch` will re-run semantic-release which will detect "no new releasable commits" and exit cleanly — wasted approval click. Verify with `gh release view v$VERSION` first.
