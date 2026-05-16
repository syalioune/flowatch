#!/usr/bin/env bash
# setup-bmad.sh — wire the public Flowatch repo to its private BMAD companion.
#
# Flowatch keeps its BMAD planning artefacts (PRD, architecture, epics,
# stories, custom skill overrides) in a separate **private** repo so they
# stay off the public OSS surface. This script:
#
#   1. Clones syalioune/flowatch-bmad to a location you choose (or reuses an
#      existing checkout).
#   2. Symlinks _bmad/ and _bmad-output/ into this working tree using absolute
#      paths captured at run time (so the private repo can sit anywhere).
#   3. Probes the BMAD install/init state and reports which pieces are present,
#      which are missing, and how to repair the install.
#
# Usage:
#   ./setup-bmad.sh                       # interactive: prompts for path + protocol
#   ./setup-bmad.sh -d <path>             # use <path>, skip prompts (assumes SSH if cloning)
#   ./setup-bmad.sh -i                    # auto-run `bmad-method install` if probe detects modules/skills missing
#   ./setup-bmad.sh -d <path> -i          # non-interactive end-to-end
#
# Only contributors with access to the private repo can run BMad skills
# end-to-end; everyone else still gets a fully functional public source tree.
#
# Re-run this script whenever you move the private repo's checkout (the
# symlinks need to be regenerated) or after you change BMAD modules.

set -euo pipefail

BMAD_REPO_DEFAULT_SSH="git@github.com:syalioune/flowatch-bmad.git"
BMAD_REPO_DEFAULT_HTTPS="https://github.com/syalioune/flowatch-bmad.git"
DEFAULT_DIR="$HOME/dev/flowatch-bmad"

# Command used both for the "→ hint" and for `-i` auto-install. Keep in one
# place so the docs and the actual run stay in sync.
BMAD_INSTALL_CMD=(npx bmad-method@latest install --directory . --modules bmm --tools claude-code --action install --yes)

usage() {
  cat <<EOF
Usage: $(basename "$0") [-d <path>] [-i] [-h]

Options:
  -d <path>  Use <path> as the location of the flowatch-bmad checkout (or
             where to clone it). Skips the interactive prompts. When the
             dir doesn't exist yet, the script clones via SSH.
  -i         Auto-run \`${BMAD_INSTALL_CMD[*]}\` if the post-symlink probe
             detects that BMAD modules or Claude Code skills are missing.
             Without this flag, the script only prints the install command
             as a hint.
  -h         Show this help.

Planning-artefact generation (PRD / architecture / epics) is never auto-run
— it always requires the human-in-the-loop BMad skills from Claude Code.
EOF
}

# --- CLI parsing --------------------------------------------------------------
BMAD_DIR=""
AUTO_INSTALL=false
INTERACTIVE=true

while getopts ":d:ih" opt; do
  case "$opt" in
    d) BMAD_DIR="$OPTARG"; INTERACTIVE=false ;;
    i) AUTO_INSTALL=true ;;
    h) usage; exit 0 ;;
    \?) echo "✗ Unknown option: -$OPTARG" >&2; usage >&2; exit 2 ;;
    :)  echo "✗ Option -$OPTARG requires an argument" >&2; usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

# Files we expect to find after a healthy `bmad-method install` run (with
# bmm + core modules and the Flowatch team overrides committed).
EXPECTED_BMAD_FILES=(
  "_bmad/_config/manifest.yaml"
  "_bmad/bmm/config.yaml"
  "_bmad/core/config.yaml"
  "_bmad/scripts/resolve_customization.py"
  "_bmad/custom/flowatch-conventions.md"
)

EXPECTED_OUTPUT_FILES=(
  "_bmad-output/planning-artifacts/prd.md"
  "_bmad-output/planning-artifacts/architecture.md"
  "_bmad-output/planning-artifacts/epics.md"
)

echo "📦 Flowatch — BMAD private companion repo setup"
echo

# --- 1. Resolve / clone the private repo --------------------------------------
if [ "$INTERACTIVE" = true ]; then
  read -rp "Where should flowatch-bmad live? [${DEFAULT_DIR}]: " BMAD_DIR
  BMAD_DIR="${BMAD_DIR:-$DEFAULT_DIR}"
else
  echo "📂 Using flowatch-bmad checkout: ${BMAD_DIR}"
fi
BMAD_DIR="${BMAD_DIR/#\~/$HOME}"

if [ ! -d "$BMAD_DIR/.git" ]; then
  if [ "$INTERACTIVE" = true ]; then
    read -rp "Clone via [s]sh or [h]ttps? [s]: " PROTO
  else
    PROTO=s
  fi
  case "${PROTO:-s}" in
    h|H|https) BMAD_REPO="$BMAD_REPO_DEFAULT_HTTPS" ;;
    *)         BMAD_REPO="$BMAD_REPO_DEFAULT_SSH"   ;;
  esac
  echo "🔄 Cloning ${BMAD_REPO} into ${BMAD_DIR}..."
  git clone "$BMAD_REPO" "$BMAD_DIR"
else
  echo "✅ Private repo already present at $BMAD_DIR"
fi

# --- 2. Ensure the private repo has the expected top-level dirs ---------------
# Don't fail if they're missing — a fresh private repo is a valid starting
# point. We create empty dirs so the symlinks resolve to something, then the
# init-state probe below will tell the user what's missing.
mkdir -p "$BMAD_DIR/_bmad" "$BMAD_DIR/_bmad-output"

# --- 3. Create absolute symlinks ----------------------------------------------
# The script lives at <repo>/scripts/setup-bmad.sh; the symlinks must land at
# the repo root, not inside scripts/. Walk one level up from BASH_SOURCE.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BMAD_ABS="$(realpath "$BMAD_DIR")"

ln -sfn "$BMAD_ABS/_bmad"        "$REPO_ROOT/_bmad"
ln -sfn "$BMAD_ABS/_bmad-output" "$REPO_ROOT/_bmad-output"

echo
echo "✅ Symlinks created:"
echo "   $REPO_ROOT/_bmad         -> $BMAD_ABS/_bmad"
echo "   $REPO_ROOT/_bmad-output  -> $BMAD_ABS/_bmad-output"

# --- 4. BMAD install / init state probe ---------------------------------------
echo
echo "🔍 Probing BMAD install/init state through the symlinks..."

missing_bmad=()
for path in "${EXPECTED_BMAD_FILES[@]}"; do
  [ -e "$REPO_ROOT/$path" ] || missing_bmad+=("$path")
done

missing_output=()
for path in "${EXPECTED_OUTPUT_FILES[@]}"; do
  [ -e "$REPO_ROOT/$path" ] || missing_output+=("$path")
done

claude_skills_count=0
if [ -d "$REPO_ROOT/.claude/skills" ]; then
  claude_skills_count="$(find "$REPO_ROOT/.claude/skills" -maxdepth 1 -type d -name 'bmad-*' 2>/dev/null | wc -l)"
fi

needs_install=false
needs_init=false

if [ "${#missing_bmad[@]}" -eq 0 ]; then
  echo "✅ BMAD modules installed (bmm, core, scripts, custom overrides)."
else
  echo "⚠ BMAD modules look incomplete:"
  for m in "${missing_bmad[@]}"; do
    echo "   ✗ missing $m"
  done
  needs_install=true
fi

if [ "$claude_skills_count" -gt 0 ]; then
  echo "✅ ${claude_skills_count} BMAD skills wired into .claude/skills/."
else
  echo "⚠ No .claude/skills/bmad-* skills found. BMad skills can't run from"
  echo "   Claude Code until they are installed."
  needs_install=true
fi

if [ "${#missing_output[@]}" -eq 0 ]; then
  echo "✅ Planning artefacts present (prd, architecture, epics)."
else
  echo "⚠ Planning artefacts are not yet generated:"
  for m in "${missing_output[@]}"; do
    echo "   ✗ missing $m"
  done
  needs_init=true
fi

# --- 5. Repair / next-step hints (or auto-install if `-i`) --------------------
if [ "$needs_install" = true ]; then
  if [ "$AUTO_INSTALL" = true ]; then
    echo
    echo "🔧 -i flag set — running BMAD install now:"
    echo "    ${BMAD_INSTALL_CMD[*]}"
    (cd "$REPO_ROOT" && "${BMAD_INSTALL_CMD[@]}")
    echo "✅ BMAD install completed. (Re-run this script without -i to confirm the probe is now green.)"
    needs_install=false
  else
    echo
    echo "→ To install or repair BMAD modules + Claude Code skills, run:"
    echo "    ${BMAD_INSTALL_CMD[*]}"
    echo "  (BMAD will write into the private repo via the symlinks created above.)"
    echo "  Or re-run this script with -i to do it automatically."
  fi
fi

if [ "$needs_init" = true ]; then
  echo
  echo "→ To generate the planning artefacts, run the BMAD planning workflow"
  echo "   from Claude Code, starting with:"
  echo "    bmad-help                          # what to do next"
  echo "    bmad-generate-project-context      # if starting from scratch"
  echo "    bmad-create-prd                    # PRD"
  echo "    bmad-create-architecture           # architecture"
  echo "    bmad-create-epics-and-stories      # backlog"
fi

if [ "$needs_install" = false ] && [ "$needs_init" = false ]; then
  echo
  echo "🎉 BMAD is fully wired. The skills (bmad-create-epics-and-stories,"
  echo "   bmad-create-story, bmad-sprint-planning, …) and"
  echo "   scripts/user-stories/from-bmad-epics.sh will resolve their"
  echo "   planning artefacts through the symlinks transparently."
fi
