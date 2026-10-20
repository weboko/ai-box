#!/usr/bin/env bash
# status.sh — inspect runs, and kill one on request.
#
# Usage:
#   status.sh --runs [--limit N]           # recent runs, newest first
#   status.sh --run <run-id|latest> [--json]
#   status.sh --latest [--json]            # same as --run latest
#   status.sh --logs <run-id> [--lines N]  # tail of the agent log
#   status.sh --report <run-id|latest>     # print the agent's report
#   status.sh --kill <run-id> [--force]    # SIGTERM (or SIGKILL) the run's process group
#   status.sh --validate                   # preflight checks
#
# Scheduled tasks: schedule.sh list.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

MODE="" RUN_ID="" LIMIT=10 LINES=200 FORCE=0 JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
       --runs)     MODE=runs; shift ;;
       --latest)   MODE=run; RUN_ID=latest; shift ;;
       --run)      MODE=run; RUN_ID="$2"; shift 2 ;;
       --logs)     MODE=logs; RUN_ID="$2"; shift 2 ;;
       --report)   MODE=report; RUN_ID="$2"; shift 2 ;;
       --kill)     MODE=kill; RUN_ID="$2"; shift 2 ;;
       --force)    FORCE=1; shift ;;
       --validate) MODE=validate; shift ;;
       --limit)    LIMIT="$2"; shift 2 ;;
       --lines)    LINES="$2"; shift 2 ;;
       --json)     JSON=1; shift ;;
    -h|--help)     sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

ensureDirs
need jq

# Resolve "latest" and check the run exists.
if [[ -n "$RUN_ID" ]]; then
  [[ "$RUN_ID" == latest ]] && RUN_ID="$(latest_run_id)"
  [[ -n "$RUN_ID" && -f "$AO_RUNS/$RUN_ID/run.json" ]] || die "no such run: ${RUN_ID:-<none yet>}"
  RDIR="$AO_RUNS/$RUN_ID"
fi

case "$MODE" in
  runs)
    printf '%-16s %-8s %-7s %-28s %s\n' RUN_ID STATUS AGENT REPO BRANCH
    run_ids | sed -n "1,${LIMIT}p" | while IFS= read -r rid; do
      jq -r --arg s "$(run_status "$rid")" \
        '[.run_id, $s, .agent, .repo, .branch] | @tsv' "$AO_RUNS/$rid/run.json" \
        | while IFS=$'\t' read -r a b c d e; do printf '%-16s %-8s %-7s %-28s %s\n' "$a" "$b" "$c" "$d" "$e"; done
    done
    ;;

  run)
    if [[ "$JSON" -eq 1 ]]; then
      jq --arg s "$(run_status "$RUN_ID")" --arg pid "$(run_pid "$RUN_ID")" \
        '.status = $s | .pid = $pid' "$RDIR/run.json"
    else
      jq -r --arg s "$(run_status "$RUN_ID")" --arg d "$RDIR" '
        "run_id   : \(.run_id)",
        "status   : \($s)\(if .exit_code then " (exit \(.exit_code))" else "" end)",
        "agent    : \(.agent)",
        "repo     : \(.repo)",
        "branch   : \(.branch)",
        "worktree : \(.worktree_path)",
        "log      : \($d)/agent.log",
        "report   : \($d)/report.md"' "$RDIR/run.json"
    fi
    ;;

  logs)
    tail -n "$LINES" "$RDIR/agent.log"
    ;;

  report)
    [[ -f "$RDIR/report.md" ]] || die "no report yet at $RDIR/report.md"
    cat "$RDIR/report.md"
    ;;

  kill)
    pid="$(run_pid "$RUN_ID")"
    if ! pid_alive "$pid"; then
      printf 'Run %s is not running\n' "$RUN_ID"; exit 0
    fi
    sig=TERM; [[ "$FORCE" -eq 1 ]] && sig=KILL
    # agent.pid is the process group leader when setsid was available.
    kill -s "$sig" -- "-$pid" 2>/dev/null || kill -s "$sig" "$pid"
    run_json_set "$RUN_ID" '.status = "killed" | .finalized_at = $t' --arg t "$(isoNow)"
    printf 'Sent SIG%s to run %s (PID %s)\n' "$sig" "$RUN_ID" "$pid"
    ;;

  validate)
    rc=0
    # check LABEL COMMAND [optional]
    check() {
      printf '%-28s' "$1"
      if eval "$2" >/dev/null 2>&1; then echo ok
      elif [[ "${3:-}" == optional ]]; then echo "missing (optional)"
      else echo FAIL; rc=1
      fi
    }
    check "git"                  "command -v git"
    check "jq"                   "command -v jq"
    check "gh authenticated"     "gh auth status"
    check "claude or codex"      "command -v claude || command -v codex"
    check "claude"               "command -v claude" optional
    check "codex"                "command -v codex" optional
    check "crontab (scheduling)" "command -v crontab" optional
    check "cron daemon running"  "cron_daemon_running" optional
    check "config.json"          "[[ -f '$AO_CONFIG' ]]" optional
    check "state dir writable"   "[[ -w '$AO_HOME' ]]"
    exit "$rc"
    ;;

  *) die "no mode given. See --help" 2 ;;
esac
