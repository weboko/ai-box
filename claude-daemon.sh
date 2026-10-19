#!/usr/bin/env bash
set -euo pipefail

# Login is a separate one-off (see README). Idle until it lands on the shared bind mount
# rather than exiting, which would only restart-loop this agent; check often so remote
# control starts right after login.
n=0
until claude auth status >/dev/null 2>&1; do
  if [ $((n % 6)) -eq 0 ]; then
    echo "$(hostname): claude not logged in; run: ./box run --rm ${BOX_SERVICE:-claude} claude auth login" >&2
  fi
  n=$((n + 1))
  sleep 5
done

exec claude remote-control --name "$(hostname)" --permission-mode bypassPermissions
