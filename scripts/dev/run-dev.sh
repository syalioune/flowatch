#!/usr/bin/env bash
# Start the Flowatch dev environment.
#
# Brings up the Flowable Docker stack (Postgres + flowable-rest + nginx CORS proxy)
# and the Vite dev server. Assumes Docker, Docker Compose, and Node are installed.
#
# Usage:
#   bash scripts/dev/run-dev.sh              # full stack + dev server
#   bash scripts/dev/run-dev.sh --no-engine  # just the dev server (engine already running)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

skip_engine=0
for arg in "$@"; do
  case "$arg" in
    --no-engine) skip_engine=1 ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [ "$skip_engine" = "0" ] && [ -f docker-compose.yml ]; then
  echo "▶ Starting Flowable stack (postgres + flowable-rest + nginx)…"
  docker compose up -d
  echo "  Waiting for engine on http://localhost:8080…"
  until curl -sf -m 2 -u rest-admin:test \
        http://localhost:8080/flowable-rest/service/management/engine \
        >/dev/null 2>&1; do
    printf '.'
    sleep 2
  done
  echo ""
  echo "✓ Engine ready."
fi

if [ ! -d node_modules ]; then
  echo "▶ Installing npm dependencies…"
  npm ci
fi

echo "▶ Starting Vite dev server on http://localhost:5173…"
exec npm run dev
