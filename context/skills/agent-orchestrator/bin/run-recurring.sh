#!/usr/bin/env bash
# run-recurring.sh — cron entry point for a recurring task spec.
#
# Usage (from cron):
#   run-recurring.sh $AO_HOME/backlog/recurring/<spec>.md
#
# Behavior:
#   - acquire flock on $AO_HOME/runs/locks/<slug>.lock
#   - if previous run-agent PID is still alive, SKIP and log
#   - otherwise delegate to run-task.sh with a fresh run id
#   - record recurring metadata + last_run_id in the spec frontmatter (in-place)

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

case "${1:-}" in
  -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  "")        die "recurring spec path is required" 2 ;;
esac
SPEC="$1"
[[ -f "$SPEC" ]] || die "spec not found: $SPEC" 1

ensureDirs
need jq; need git; need gh; need flock

SLUG="$(fm_get task_slug "$SPEC")"
[[ -n "$SLUG" ]] || SLUG="$(slugify "$(fm_get title "$SPEC")")"
LOCK="$AO_LOCKS/${SLUG}.lock"
CRON_LOG="$AO_RUNS/cron.${SLUG}.log"

exec 9>"$LOCK"
if ! flock -n 9; then
  # Lock held by another wrapper invocation.
  HELD_PID="$(cat "$LOCK" 2>/dev/null || echo ?)"
  printf '%s SKIP slug=%s reason=lock-held holder_pid=%s\n' "$(isoNow)" "$SLUG" "$HELD_PID" >> "$CRON_LOG"
  exit 0
fi
echo "$$" >&9

# Stricter overlap: also skip if previous run's agent PID is still alive.
LAST_RUN_ID="$(fm_get last_run_id "$SPEC" || true)"
if [[ -n "$LAST_RUN_ID" ]]; then
  shopt -s nullglob
  for p in "$AO_RUNS/$LAST_RUN_ID/${SLUG}."*.log.pid; do
    LAST_PID="$(cat "$p" 2>/dev/null || true)"
    if [[ -n "${LAST_PID:-}" ]] && kill -0 "$LAST_PID" 2>/dev/null; then
      printf '%s SKIP slug=%s reason=previous-agent-alive last_run_id=%s pid=%s log=%s\n' \
        "$(isoNow)" "$SLUG" "$LAST_RUN_ID" "$LAST_PID" "${p%.pid}" >> "$CRON_LOG"
      exit 0
    fi
  done
  shopt -u nullglob
fi

RUN_ID="$(runId)"
printf '%s RUN slug=%s run_id=%s\n' "$(isoNow)" "$SLUG" "$RUN_ID" >> "$CRON_LOG"

"$(dirname "$(readlink -f "$0")")/run-task.sh" \
  --task "$SPEC" \
  --run-id "$RUN_ID" \
  --print-meta >> "$CRON_LOG" 2>&1

# Update last_run_id in the spec frontmatter (idempotent).
TMP="$(mktemp)"
awk -v rid="$RUN_ID" '
  BEGIN { in_fm=0; replaced=0 }
  /^---[[:space:]]*$/ { in_fm = !in_fm; print; next }
  in_fm && /^last_run_id:/ { print "last_run_id: \"" rid "\""; replaced=1; next }
  in_fm && /^status:/ && !replaced {
    print "last_run_id: \"" rid "\""
    replaced=1
  }
  { print }
' "$SPEC" > "$TMP" && mv "$TMP" "$SPEC"
