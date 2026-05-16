# GitHub bootstrap

This document describes how to initially set up the various GitHub repository artifacts from day one:

- [Milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones)
- [Labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
- [Issues](https://github.com/features/issues)
- [Project](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [Branch protection rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)

## 0) Install the required tools

- [Make 4.4.1+](https://www.gnu.org/software/make/manual/)
- [jq 1.8.1+](https://jqlang.org/download/)
- [GitHub CLI 2.78.0+](https://cli.github.com/) (authenticated: `gh auth login`)
- [Python 3.10+](https://www.python.org/downloads/) — for the initial backlog import (step 3). On Debian/Ubuntu, system Python ships without `pip` or `venv`; install them once:

  ```shell
  sudo apt install -y python3-venv
  ```

  Then create a project-local venv and install the script's dependencies:

  ```shell
  python3 -m venv .venv
  .venv/bin/pip install -r scripts/user-stories/requirements.txt
  ```

  `.venv/` is already in [.gitignore](.gitignore).

## 1) Bootstrap labels, milestones, project, and branch protections

```shell
make bootstrap                              # REPO auto-detected from `origin` remote
# or pin it explicitly:
make bootstrap REPO=syalioune/flowatch
```

Without `make`:

```shell
bash scripts/bootstrap-gh/create-labels.sh    syalioune/flowatch
bash scripts/bootstrap-gh/create-milestones.sh syalioune/flowatch
bash scripts/bootstrap-gh/create-project.sh   syalioune flowatch "Flowatch Roadmap"
bash scripts/bootstrap-gh/protect-branches.sh syalioune/flowatch
```

All steps are idempotent — re-running them upserts/patches existing items.

> ⚠️ **First run on an empty repo:** `protect-branches.sh` cannot apply protections to `main` until at least one commit has landed there. On a brand-new repo, expect that step to fail — see [§1.5](#15-branch-protection-sequencing). Run labels, milestones, and project now; defer protections until after the 0.0.1 seed commit.

## 1.5) Branch-protection sequencing

The intended sequence for a fresh repo:

1. Run `make bootstrap` (or the explicit scripts above) — labels, milestones, project. The `protect-branches.sh` step will fail because `main` is empty; that is expected. Re-run it in step 4.
2. Develop the entire 0.0.1 milestone on the `develop` branch (long-lived working branch) with per-story conventional commits. No merges to `main` during this phase. **Do not squash** the per-story commits before pushing develop — semantic-release reads each one to build the themed changelog ([release.config.mjs](release.config.mjs) groups them under 🎭 Design System, 🧭 Routing, 🛡️ Quality Gates, etc.). Preview at any time with:

   ```shell
   # On a fresh repo with no v0.0.1 tag yet, use the empty-tree as the base:
   EMPTY_TREE=$(git hash-object -t tree /dev/null)
   node scripts/release/preview-fast.mjs --range "${EMPTY_TREE}..HEAD" --version 0.0.1
   ```

3. Open `release/0.0.1` from `develop`, stabilize, then open a PR `release/0.0.1 → main` and **merge it with a regular merge commit (or rebase-merge)** — **not** a squash-merge. Squash-merging would collapse the per-story commits into one, leaving semantic-release nothing to render in the stable 0.0.1 release notes on `main`.

   Put `Closes #1, Closes #2, … Closes #25` in the **PR description** (not the merge commit). GitHub auto-closes referenced issues when the PR merges regardless of merge strategy, so the imported backlog still closes cleanly.

   The merge commit subject is free-form (e.g. `Merge release/0.0.1 into main`); semantic-release ignores merge commits and derives the headline + body from the per-story conventional commits.
4. Now that `main` has commits, apply protections:

   ```shell
   bash scripts/bootstrap-gh/protect-branches.sh syalioune/flowatch
   ```

Subsequent releases follow the same pattern — `develop → release/x.y.z → main` — and protections do not need to be re-run.

## 2) Link the generated project to the repository

- Go to [Flowatch projects](https://github.com/syalioune/flowatch/projects?query=is%3Aopen)
- Click **Link a project**
- Choose **Flowatch Roadmap**

## 3) Import the initial user-story backlog

```shell
.venv/bin/python scripts/user-stories/import_issues.py \
  --repo  syalioune/flowatch \
  --token "$(gh auth token)" \
  --file  docs/specifications/user-stories/flowatch_backlog.csv
```

Add `--dry-run --verbose` to preview without writing to GitHub.

To smoke-test the script end-to-end without touching the real backlog, point `--file` at [docs/specifications/user-stories/flowatch_backlog_smoketest.csv](docs/specifications/user-stories/flowatch_backlog_smoketest.csv) — it creates a single throwaway issue + milestone + labels you can delete by hand afterwards.

## 4) Docker Hub secrets (for image publishing)

The `image` job in [.github/workflows/ci.yml](.github/workflows/ci.yml) pushes the Flowatch SPA Docker image to **both** GitHub Container Registry (`ghcr.io/syalioune/flowatch`) and Docker Hub (`docker.io/syalioune/flowatch`).

- The **ghcr.io** push uses the workflow-scoped `GITHUB_TOKEN` automatically — nothing to configure.
- The **Docker Hub** push requires two repository secrets that **must be set once by the maintainer**. Without them, the `image` job's `Login to Docker Hub` step fails; the rest of CI is unaffected (the job is auxiliary and is not in [required_checks.json](.github/protection/required_checks.json), so merges aren't blocked).

### Create a Docker Hub access token

1. Sign in to [hub.docker.com](https://hub.docker.com/) as `syalioune`.
2. Go to **Account settings → Personal access tokens → Generate new token**.
3. Name: `flowatch-ci`. Permissions: **Read, Write, Delete**. Repository scope: **`syalioune/flowatch` only** (do not grant org-wide). Expiry: maintainer's choice (recommend 1 year + a calendar reminder).
4. Copy the token immediately — Docker Hub does not show it again.

### Wire the secrets

```shell
echo -n "syalioune" | gh secret set DOCKERHUB_USERNAME --repo syalioune/flowatch
gh secret set DOCKERHUB_TOKEN --repo syalioune/flowatch < /path/to/pat-from-step-3.txt

# Verify both are now listed (values are hidden):
gh secret list --repo syalioune/flowatch | grep DOCKERHUB
```

### Rotation

When the PAT is about to expire, regenerate it on Docker Hub (steps 1-3 above) and re-run the `gh secret set DOCKERHUB_TOKEN` command — secrets overwrite cleanly. No workflow changes needed.
