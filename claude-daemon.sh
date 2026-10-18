#!/usr/bin/env bash
set -euo pipefail

# Login is a separate one-off (see README). Idle until it lands on the shared bind mount
# rather than exiting, which in the combined box would only restart-loop this agent.
until claude auth status >/dev/null 2>&1; do
  echo "$(hostname): claude not logged in; run: ./box run --rm ${BOX_SERVICE:-claude} claude auth login" >&2
  sleep 30
done

exec claude remote-control --name "$(hostname)" --permission-mode bypassPermissions
