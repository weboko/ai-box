#!/usr/bin/env bash
set -euo pipefail

# `codex remote-control start` only launches a detached app-server daemon and returns, so
# it cannot be supervised directly: this script starts it (or adopts one already running)
# and lives as long as it does.

state="$CODEX_HOME/app-server-daemon"

daemon_alive() {
  pgrep -f -- 'app-server --remote-control' >/dev/null
}

# Login is a separate one-off (see README). Idle until it lands on the shared bind mount
# rather than crash-looping; check often so the daemon starts right after login.
n=0
until codex login status >/dev/null 2>&1; do
  if [ $((n % 6)) -eq 0 ]; then
    echo "$(hostname): codex not logged in; run: ./box run --rm ${BOX_SERVICE:-codex} codex login --device-auth" >&2
  fi
  n=$((n + 1))
  sleep 5
done

if daemon_alive; then
  # This script was restarted while the daemon kept running: its socket and pidfile are
  # live, so leave them alone.
  echo "$(hostname): codex daemon already running; adopting it" >&2
else
  # No daemon in this container, so any pidfile or control socket on the bind-mounted
  # $CODEX_HOME belongs to one that is gone.
  rm -f "$state"/*.pid "$CODEX_HOME/app-server-control/app-server-control.sock"
  # Start can report "connection is errored" while the daemon it launched is fine and
  # still connecting; only a daemon that is not running counts as a failure.
  if ! codex remote-control start; then
    daemon_alive || exit 1
    echo "$(hostname): codex daemon started; remote connection still coming up" >&2
  fi
fi

# A previous run killed outright never got to stop its tail.
pkill -f -- "^tail -n 0 -F $state/daemon.stderr.log" || true
tail -n 0 -F "$state/daemon.stderr.log" &
tail_pid=$!

# This script is restarted in place by box-supervisor.sh, so don't leave the tail behind.
trap 'kill "$tail_pid" 2>/dev/null || true' EXIT
trap 'codex remote-control stop || true; exit 0' TERM INT

# Watch the process rather than a PID read once from daemon.pid: Codex can replace that
# PID after start. Exit when the daemon is gone so the supervisor brings it back.
while daemon_alive; do
  sleep 5 &
  wait $!
done

echo "$(hostname): codex daemon exited" >&2
exit 1
