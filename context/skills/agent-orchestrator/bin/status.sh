#!/usr/bin/env bash
# status.sh — read-only inspection + targeted kills.
#
# Usage:
#   status.sh --runs [--limit N]            # list recent runs
#   status.sh --latest [--json]             # show the most recent run
#   status.sh --run <run-id>                # show a specific run
#   status.sh --logs <run-id> [--lines N]   # tail of a run's log
#   status.sh --report <run-id|latest>      # print the report
#   status.sh --cron                        # list managed cron blocks
#   status.sh --next --slug <slug>          # next firing time
#   status.sh --kill <run-id> [--force]     # kill the run's PID
#   status.sh --validate                    # preflight checks
#
# Read-only by default. The only action it takes is --kill.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

MODE="" RUN_ID="" SLUG="" LIMIT=10 LINES=200 FORCE=0 JSON=0
while [[ $# -gt 0 ]]; do
  case "$1" in
       --runs)     MODE="runs"; shift ;;
       --latest)   MODE="latest"; shift ;;
       --run)      MODE="run"; RUN_ID="$2"; shift 2 ;;
       --logs)     MODE="logs"; RUN_ID="$2"; shift 2 ;;
       --report)   MODE="report"; RUN_ID="$2"; shift 2 ;;
       --cron)     MODE="cron"; shift ;;
       --next)     MODE="next"; shift ;;
       --slug)     SLUG="$2"; shift 2 ;;
       --kill)     MODE="kill"; RUN_ID="$2"; shift 2 ;;
       --force)    FORCE=1; shift ;;
       --validate) MODE="validate"; shift ;;
       --limit)    LIMIT="$2"; shift 2 ;;
       --lines)    LINES="$2"; shift 2 ;;
       --json)     JSON=1; shift ;;
    -h|--help)     sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

ensureDirs
need jq

# Live-status decoration: "running" entries get checked against their PID.
runs_with_live_status() {
  jq -c '.[]' "$AO_INDEX" | while IFS= read -r row; do
    pid="$(jq -r .pid <<<"$row")"
    status="$(jq -r .status <<<"$row")"
    if [[ "$status" == "running" && -n "$pid" && "$pid" != "null" ]]; then
      if ! kill -0 "$pid" 2>/dev/null; then
        row="$(jq -c '.status = "exited"' <<<"$row")"
      fi
    fi
    printf '%s\n' "$row"
  done
}

case "$MODE" in
  runs)
    runs_with_live_status \
      | jq -s --argjson n "$LIMIT" '.[0:$n] | .[] |
          [.run_id, .status, .agent, .repo, .task_slug, .branch, .log_file] | @tsv' -r \
      | column -t -s $'\t' -N "RUN_ID,STATUS,AGENT,REPO,SLUG,BRANCH,LOG"
    ;;

  latest)
    entry="$(index_latest)"
    if [[ "$JSON" -eq 1 ]]; then
      echo "$entry" | jq .
    else
      echo "$entry" | jq -r '
        "run_id   : \(.run_id)",
        "status   : \(.status)",
        "agent    : \(.agent)",
        "repo     : \(.repo)",
        "branch   : \(.branch)",
        "worktree : \(.worktree_path)",
        "log      : \(.log_file)",
        "report   : \(.run_dir)/report.md"' 2>/dev/null
    fi
    ;;

  run)
    [[ -n "$RUN_ID" ]] || die "--run requires <run-id>" 2
    index_get "$RUN_ID" | jq .
    ;;

  logs)
    [[ -n "$RUN_ID" ]] || die "--logs requires <run-id>" 2
    log_file="$(index_get "$RUN_ID" | jq -r .log_file)"
    [[ -f "$log_file" ]] || die "log not found: $log_file"
    tail -n "$LINES" "$log_file"
    ;;

  report)
    if [[ "$RUN_ID" == "latest" || -z "$RUN_ID" ]]; then
      RUN_ID="$(index_latest | jq -r .run_id)"
    fi
    rdir="$AO_RUNS/$RUN_ID"
    if [[ -f "$rdir/report.md" ]]; then
      cat "$rdir/report.md"
    else
      die "no report at $rdir/report.md"
    fi
    ;;

  cron)
    cron_dump | awk '/^# AGENT-ORCHESTRATOR TASK BEGIN/,/^# AGENT-ORCHESTRATOR TASK END/'
    ;;

  next)
    [[ -n "$SLUG" ]] || die "--next requires --slug" 2
    block="$(cron_dump | cron_find_block "slug=$SLUG")"
    [[ -n "$block" ]] || die "no managed cron block for slug=$SLUG"
    cron_line="$(printf '%s\n' "$block" | grep -v '^#' | head -1)"
    cron_expr="$(printf '%s\n' "$cron_line" | awk '{print $1, $2, $3, $4, $5}')"
    status="$(printf '%s\n' "$block" | head -1 | sed -E 's/.*status=([a-z]+).*/\1/')"
    tz="$(cron_dump | awk -F= '/^CRON_TZ=/ {print $2; exit}')"
    next=""
    if command -v python3 >/dev/null 2>&1 && python3 -c 'import croniter' 2>/dev/null; then
      next="$(python3 - "$cron_expr" <<'PY'
import sys, datetime
from croniter import croniter
expr=sys.argv[1]
print(croniter(expr, datetime.datetime.now()).get_next(datetime.datetime).isoformat())
PY
)"
    fi
    printf 'slug      : %s\n' "$SLUG"
    printf 'cron      : %s\n' "$cron_expr"
    printf 'timezone  : %s\n' "$tz"
    printf 'status    : %s\n' "$status"
    [[ -n "$next" ]] && printf 'next run  : %s\n' "$next"
    ;;

  kill)
    [[ -n "$RUN_ID" ]] || die "--kill requires <run-id>" 2
    entry="$(index_get "$RUN_ID")"
    [[ "$entry" != "null" ]] || die "run not in index: $RUN_ID"
    pid="$(jq -r .pid <<<"$entry")"
    [[ -n "$pid" && "$pid" != "null" ]] || die "no PID recorded for $RUN_ID"
    if ! kill -0 "$pid" 2>/dev/null; then
      printf 'PID %s already exited\n' "$pid"; exit 0
    fi
    if [[ "$FORCE" -eq 1 ]]; then
      kill -9 "$pid"; printf 'Force-killed %s (run %s)\n' "$pid" "$RUN_ID"
    else
      kill "$pid";    printf 'Sent SIGTERM to %s (run %s)\n' "$pid" "$RUN_ID"
    fi
    ;;

  validate)
    rc=0
    check() { printf '%-40s' "$1"; if eval "$2" >/dev/null 2>&1; then echo "ok"; else echo "FAIL"; rc=1; fi; }
    check "run-agent.sh executable"        "[[ -x '$AO_RUN_AGENT' ]]"
    check "config.json exists"             "[[ -f '$AO_CONFIG' ]]"
    check "claude binary"                  "command -v claude"
    check "codex binary"                   "command -v codex"
    check "gh authenticated"               "gh auth status"
    check "git available"                  "command -v git"
    check "jq available"                   "command -v jq"
    check "flock available"                "command -v flock"
    check "runs dir writable"              "[[ -w '$AO_RUNS' ]]"
    check "repos dir writable"             "[[ -w '$AO_REPOS' ]]"
    check "backlog dir writable"           "[[ -w '$AO_BACKLOG' ]]"
    exit "$rc"
    ;;

  *) die "no mode given. See --help" 2 ;;
esac
