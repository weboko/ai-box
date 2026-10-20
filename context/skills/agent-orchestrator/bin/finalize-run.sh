#!/usr/bin/env bash
# finalize-run.sh — record a finished run's outcome, copy its report to
# $AO_HOME/reports/, and move a one-off spec from backlog/ to backlog/done/.
#
# Usage:
#   finalize-run.sh --run-id 20260508-103012
#   finalize-run.sh --latest
#
# run-agent.sh calls this automatically when the agent exits; run it by hand only
# to repair a run whose process died without finalizing. Idempotent.
#
# Outcome: done if the agent exited 0 and wrote report.md, otherwise failed.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

RUN_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
       --run-id) RUN_ID="$2"; shift 2 ;;
       --latest) RUN_ID="$(latest_run_id)"; shift ;;
    -h|--help)   sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -n "$RUN_ID" ]] || die "specify --run-id or --latest" 2
need jq
ensureDirs

RDIR="$AO_RUNS/$RUN_ID"
RJ="$RDIR/run.json"
[[ -f "$RJ" ]] || die "no run.json for $RUN_ID"

STATUS="$(jq -r .status "$RJ")"
if [[ "$STATUS" != running ]]; then
  log "$RUN_ID already finalized ($STATUS)"
  exit 0
fi

if [[ -f "$RDIR/exit_code" ]]; then
  CODE="$(cat "$RDIR/exit_code")"
elif pid_alive "$(run_pid "$RUN_ID")"; then
  log "$RUN_ID still running; nothing to do"
  exit 0
else
  CODE="none"   # process gone without recording an exit code
fi

OUTCOME=failed
[[ "$CODE" == 0 && -f "$RDIR/report.md" ]] && OUTCOME=done

SLUG="$(jq -r .task_slug "$RJ")"
AGENT="$(jq -r .agent "$RJ")"
TASK_FILE="$(jq -r .task_file "$RJ")"

# Copy the report either way — a failure report is still worth reading.
if [[ -f "$RDIR/report.md" ]]; then
  cp -f "$RDIR/report.md" "$AO_REPORTS/${SLUG}_${RUN_ID}_${AGENT}.md"
fi

# One-off specs launched from the backlog are done once they've run.
if [[ -f "$TASK_FILE" && "$(dirname "$TASK_FILE")" == "$AO_BACKLOG" ]]; then
  mv -f "$TASK_FILE" "$AO_BACKLOG/done/"
fi

run_json_set "$RUN_ID" '.status = $s | .exit_code = $c | .finalized_at = $t' \
  --arg s "$OUTCOME" --arg c "$CODE" --arg t "$(isoNow)"
log "$RUN_ID → $OUTCOME (exit $CODE)"
