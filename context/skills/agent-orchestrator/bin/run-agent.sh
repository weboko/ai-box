#!/usr/bin/env bash
# run-agent.sh — start an agent in the background on a prepared run folder.
#
# Usage:
#   run-agent.sh --agent claude|codex --run-dir RUN_DIR --workdir DIR
#
# Expects RUN_DIR/agent-task.md. Runs the agent inside DIR (the run's worktree or a
# persistent workspace), detached, with the task on stdin and output in RUN_DIR/agent.log.
# Writes RUN_DIR/agent.pid (the process group), then RUN_DIR/exit_code when the
# agent exits, and finalizes the run (finalize-run.sh) right after.
#
# Agents always run in unrestricted mode; there is no safe-mode switch.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

AGENT="" RUN_DIR="" WORKDIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--agent)   AGENT="$2"; shift 2 ;;
       --run-dir) RUN_DIR="$2"; shift 2 ;;
       --workdir) WORKDIR="$2"; shift 2 ;;
    -h|--help)    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -f "$RUN_DIR/agent-task.md" ]] || die "missing $RUN_DIR/agent-task.md" 1
[[ -d "$WORKDIR" ]]               || die "workdir not found: ${WORKDIR:-<none given>}" 1
need_agent "$AGENT"

case "$AGENT" in
  claude) CMD=(claude -p --dangerously-skip-permissions --output-format stream-json --verbose) ;;
  codex)  CMD=(codex exec --dangerously-bypass-approvals-and-sandbox --json -) ;;
esac

# setsid gives the agent its own process group, so it outlives the caller (cron,
# the orchestrating session) and `status.sh --kill` can stop all of it at once.
DETACH=(nohup)
command -v setsid >/dev/null 2>&1 && DETACH=(setsid)

# shellcheck disable=SC2016  # expanded by the inner bash
"${DETACH[@]}" bash -c '
  dir=$1 workdir=$2 finalize=$3; shift 3
  cd "$workdir" || exit 1
  "$@" < "$dir/agent-task.md" > "$dir/agent.log" 2>&1
  echo $? > "$dir/exit_code"
  "$finalize" --run-id "${dir##*/}" >> "$dir/finalize.log" 2>&1
' _ "$RUN_DIR" "$WORKDIR" "$AO_BIN/finalize-run.sh" "${CMD[@]}" < /dev/null > /dev/null 2>&1 &

echo "$!" > "$RUN_DIR/agent.pid"
echo "$!"
