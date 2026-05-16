#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
#
# Fail-fast validation of $ALLOWED_ORIGIN before nginx renders the template.
# Mounted into /docker-entrypoint.d/ in docker-compose.yml so it runs after
# the official nginx image's envsubst step but before nginx itself starts.
#
# Catches three classes of misconfig that silently break CORS in browsers:
#   1. empty value         → Access-Control-Allow-Origin: ""  (rejects everything)
#   2. trailing slash      → spec violation; some browsers reject
#   3. comma-separated     → spec violation; not a single origin
#
# The `*` wildcard is technically valid CORS but incompatible with
# Access-Control-Allow-Credentials: true (which we always send), so we
# reject it too.
#
# See docker/nginx.conf.template for the full contract.

set -eu

if [ -z "${ALLOWED_ORIGIN:-}" ]; then
  echo "✗ ALLOWED_ORIGIN is empty. Set it to a single origin like 'http://localhost:5173' (no trailing slash)." >&2
  exit 1
fi

case "$ALLOWED_ORIGIN" in
  */)
    echo "✗ ALLOWED_ORIGIN ends with '/': '$ALLOWED_ORIGIN'. CORS requires a bare origin (no trailing slash)." >&2
    exit 1
    ;;
  *,*)
    echo "✗ ALLOWED_ORIGIN contains ',': '$ALLOWED_ORIGIN'. CORS allows only a single origin per response." >&2
    exit 1
    ;;
  '*')
    echo "✗ ALLOWED_ORIGIN='*' is incompatible with Access-Control-Allow-Credentials: true. Use an explicit origin." >&2
    exit 1
    ;;
esac

echo "✓ ALLOWED_ORIGIN=$ALLOWED_ORIGIN"
