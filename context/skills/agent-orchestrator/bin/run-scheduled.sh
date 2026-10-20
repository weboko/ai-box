#!/usr/bin/env bash
# run-scheduled.sh — cron entry point for a scheduled spec (written by schedule.sh sync).
#
# Usage:
#   run-scheduled.sh $AO_HOME/scheduled/<slug>.md
#
# Skips if the spec is stopped or the previous run is still alive; otherwise
# launches it via run-task.sh and records last_run_id in the spec. A run_at spec
# is moved to backlog/done/ after launching, so it fires once.
# Output goes to $AO_HOME/runs/cron.<slug>.log (redirected by the cron line).

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

case "${1:-}" in
  -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "")        die "scheduled spec path is required" 2 ;;
esac
SPEC="$1"
[[ -f "$SPEC" ]] || die "spec not found: $SPEC" 1
need jq

SLUG="$(spec_slug "$SPEC")"

if [[ "$(fm_get status "$SPEC")" != active ]]; then
  printf '%s SKIP slug=%s reason=stopped\n' "$(isoNow)" "$SLUG"
  exit 0
fi

LAST="$(fm_get last_run_id "$SPEC")"
if [[ -n "$LAST" && -f "$AO_RUNS/$LAST/run.json" && "$(run_status "$LAST")" == running ]]; then
  printf '%s SKIP slug=%s reason=previous-run-alive run_id=%s pid=%s log=%s\n' \
    "$(isoNow)" "$SLUG" "$LAST" "$(run_pid "$LAST")" "$AO_RUNS/$LAST/agent.log"
  exit 0
fi

RUN_ID="$("$AO_BIN/run-task.sh" --task "$SPEC" --print-meta | jq -r .run_id)"
fm_set last_run_id "$RUN_ID" "$SPEC"
printf '%s RUN slug=%s run_id=%s\n' "$(isoNow)" "$SLUG" "$RUN_ID"

if [[ -n "$(fm_get run_at "$SPEC")" ]]; then
  mv -f "$SPEC" "$AO_BACKLOG/done/"
  "$AO_BIN/schedule.sh" sync
fi
