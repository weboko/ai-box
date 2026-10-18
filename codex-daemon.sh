#!/usr/bin/env bash
set -euo pipefail

# `codex remote-control start` only launches a detached app-server daemon and returns, so
# it cannot be PID 1 by itself: this script starts it and lives as long as it does.

state="$CODEX_HOME/app-server-daemon"

# Login is a separate one-off (see README). Idle until it lands on the shared bind mount
# rather than crash-looping the container.
until codex login status >/dev/null 2>&1; do
  echo "codex-box: not logged in; run: docker compose run --rm codex codex login --device-auth" >&2
  sleep 30
done

# Nothing else runs in this container, so any pidfile or control socket on the
# bind-mounted $CODEX_HOME belongs to a previous container.
rm -f "$state"/*.pid "$CODEX_HOME/app-server-control/app-server-control.sock"

codex remote-control start
pid="$(jq -r .pid "$state/daemon.pid")"

trap 'codex remote-control stop || true; exit 0' TERM INT

tail -n +1 -F "$state/daemon.stderr.log" &

# Exit when the daemon does, so Docker's restart policy brings it back.
while kill -0 "$pid" 2>/dev/null; do
  sleep 5 &
  wait $!
done

echo "codex-box: daemon (pid $pid) exited" >&2
exit 1
