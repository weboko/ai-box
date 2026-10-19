#!/usr/bin/env bash
set -uo pipefail

# Runs every long-lived process of a box — its agents ($BOX_AGENTS), the web server and the
# Cloudflare tunnel — and restarts whichever one exits, leaving the others alone.

logs="$HOME/logs"
mkdir -p "$logs" "$HOME/www"

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

pgs=()
claude_here=0

# Each loop gets its own session, hence its own process group (pgid == $!), so a stop
# signal reaches the service itself and not just the loop around it. A session rather than
# `set -m` job control: background jobs touching the container's TTY would be stopped.
start() {
  local name=$1
  shift
  if [ "$name" = claude ]; then
    # Claude's remote-control UI needs the container terminal.
    claude_here=1
    setsid bash -c 'supervise "$@"' _ "$name" "$@" &
  else
    # Everything else logs to a file, where Claude's redraws cannot paint over it.
    : >>"$logs/$name.log"
    setsid bash -c 'log=$1; shift; supervise "$@" >>"$log" 2>&1' _ "$logs/$name.log" "$name" "$@" &
  fi
  pgs+=("$!")
}

for agent in ${BOX_AGENTS:-}; do
  start "$agent" "$agent-daemon.sh"
done

start web caddy file-server --browse --root "$HOME/www" --listen ":${WEB_PORT:-8080}"

if [ -n "${TUNNEL_TOKEN:-}" ]; then
  # cloudflared reads the token from TUNNEL_TOKEN.
  start tunnel cloudflared tunnel --no-autoupdate run
else
  echo "$(hostname): tunnel skipped: no TUNNEL_TOKEN" | tee -a "$logs/tunnel.log" >&2
fi

# Without Claude the terminal is free, so mirror the logs to it for `./box logs`.
if [ "$claude_here" = 0 ]; then
  tail -n 0 -F "$logs"/*.log &
  pgs+=("$!")
fi

trap 'for pg in "${pgs[@]}"; do kill -TERM -- -"$pg" 2>/dev/null || kill -TERM "$pg" 2>/dev/null; done; wait; exit 0' TERM INT

wait
