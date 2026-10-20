#!/usr/bin/env bash
# run-agent.sh — start one agent in the background on a task file.
#
# Usage:
#   run-agent.sh --agent claude|codex --task agent-task.md --log run.log
#                [--run-id ID] [--print-meta]
#
# Runs in the current directory (the worktree), detached from the caller, with
# the task piped on stdin. Writes the agent PID to <log>.pid. With --print-meta,
# prints {"pid":…,"agent":…,"log":…,"run_id":…} on stdout.
#
# Agents always run in unrestricted mode; there is no safe-mode switch.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

AGENT="" TASK="" LOG_FILE="" RUN_ID="" PRINT_META=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -a|--agent)      AGENT="$2"; shift 2 ;;
    -t|--task)       TASK="$2"; shift 2 ;;
    -l|--log)        LOG_FILE="$2"; shift 2 ;;
       --run-id)     RUN_ID="$2"; shift 2 ;;
       --print-meta) PRINT_META=1; shift ;;
    -h|--help)       sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -n "$AGENT" ]]    || die "--agent is required" 2
[[ -f "$TASK" ]]     || die "task file not found: $TASK" 1
[[ -n "$LOG_FILE" ]] || die "--log is required" 2

case "$AGENT" in
  claude)
    command -v claude >/dev/null 2>&1 \
      || die "agent binary not found: claude. Install hint: npm install -g @anthropic-ai/claude-code"
    CMD=(claude -p --dangerously-skip-permissions --output-format stream-json --verbose)
    ;;
  codex)
    command -v codex >/dev/null 2>&1 \
      || die "agent binary not found: codex. Install hint: npm install -g @openai/codex"
    CMD=(codex exec --dangerously-bypass-approvals-and-sandbox --json -)
    ;;
  *) die "invalid agent: $AGENT (expected claude or codex)" 2 ;;
esac

mkdir -p "$(dirname "$LOG_FILE")"

# setsid puts the agent in its own session so it outlives the caller (cron,
# the orchestrating session). Not every platform ships it.
DETACH=(nohup)
command -v setsid >/dev/null 2>&1 && DETACH=(setsid nohup)

"${DETACH[@]}" "${CMD[@]}" < "$TASK" > "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "${LOG_FILE}.pid"

if [[ "$PRINT_META" -eq 1 ]]; then
  jq -n --argjson pid "$PID" --arg agent "$AGENT" --arg log "$LOG_FILE" --arg run_id "$RUN_ID" \
    '{pid:$pid, agent:$agent, log:$log, run_id:$run_id}'
else
  printf 'Started %s (PID %s), log: %s\n' "$AGENT" "$PID" "$LOG_FILE"
fi
