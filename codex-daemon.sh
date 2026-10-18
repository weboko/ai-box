#!/usr/bin/env bash
set -euo pipefail

# `codex remote-control start` only launches a detached app-server daemon and returns, so
# it cannot be a container's main process by itself: this script starts it and lives as
# long as it does.

state="$CODEX_HOME/app-server-daemon"

# Login is a separate one-off (see README). Idle until it lands on the shared bind mount
# rather than crash-looping.
until codex login status >/dev/null 2>&1; do
  echo "$(hostname): codex not logged in; run: docker compose run --rm ${BOX_SERVICE:-codex} codex login --device-auth" >&2
  sleep 30
done

# Nothing else in this container uses $CODEX_HOME, so any pidfile or control socket on
# the bind mount belongs to a daemon that is already gone.
rm -f "$state"/*.pid "$CODEX_HOME/app-server-control/app-server-control.sock"

codex remote-control start
pid="$(jq -r .pid "$state/daemon.pid")"

tail -n +1 -F "$state/daemon.stderr.log" &
tail_pid=$!

# Under box-supervisor.sh this script is restarted in place, so don't leave the tail behind.
trap 'kill "$tail_pid" 2>/dev/null || true' EXIT
trap 'codex remote-control stop || true; exit 0' TERM INT

# Exit when the daemon does, so Docker's restart policy (or box-supervisor.sh) brings it
# back.
while kill -0 "$pid" 2>/dev/null; do
  sleep 5 &
  wait $!
done

echo "$(hostname): codex daemon (pid $pid) exited" >&2
exit 1
