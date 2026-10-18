#!/usr/bin/env bash
set -uo pipefail

# Runs both agents in one container and restarts whichever one exits, leaving the other's
# sessions alone.

supervise() {
  local name=$1
  shift
  while :; do
    local rc=0
    "$@" || rc=$?
    echo "$(hostname): $name exited ($rc); restarting in 10s" >&2
    sleep 10
  done
}
export -f supervise

# Each loop gets its own session, hence its own process group (pgid == $!), so a stop
# signal reaches the agent itself and not just the loop around it. A session rather than
# `set -m` job control: background jobs touching the container's TTY would be stopped.
setsid bash -c 'supervise claude claude-daemon.sh' &
claude_pg=$!
setsid bash -c 'supervise codex codex-daemon.sh' &
codex_pg=$!

trap 'kill -TERM -- -"$claude_pg" -"$codex_pg" 2>/dev/null; wait; exit 0' TERM INT

wait
