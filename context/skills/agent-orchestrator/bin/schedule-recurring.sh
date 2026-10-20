#!/usr/bin/env bash
# schedule-recurring.sh — install a managed cron block from a recurring spec.
#
# Usage:
#   schedule-recurring.sh --spec /path/to/recurring-spec.md
#
# Reads cron_expression and timezone from the spec frontmatter (timezone falls
# back to config.json; if neither is set, cron uses the system timezone),
# ensures CRON_TZ is at the top of the user crontab, and writes a managed block
# delimited by `# AGENT-ORCHESTRATOR TASK BEGIN/END id=<slug>-<spec-runid>`.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

SPEC=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--spec) SPEC="$2"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -f "$SPEC" ]] || die "spec not found: $SPEC" 1
need crontab; need awk

SLUG="$(fm_get task_slug "$SPEC")"
CRON="$(fm_get cron_expression "$SPEC")"
SPEC_TZ="$(fm_get timezone "$SPEC")"
[[ -z "$SPEC_TZ" ]] && SPEC_TZ="$(cfg timezone "")"

[[ -n "$SLUG" ]] || die "spec missing task_slug"
[[ -n "$CRON" ]] || die "spec missing cron_expression — convert schedule_text first"

# Stable id derived from the spec's filename's run-id segment, falling back to slug+now.
SPEC_BASE="$(basename "$SPEC" .md)"
ID="$SPEC_BASE"  # already <slug>_<runid> by convention

CMD="AO_HOME=$AO_HOME $AO_SKILL_DIR/bin/run-recurring.sh $SPEC"
LOG="$AO_RUNS/cron.${SLUG}.log"

[[ -n "$SPEC_TZ" ]] && ensure_cron_tz "$SPEC_TZ"

NEW="$(cron_dump | cron_strip_block "$ID")"
{
  printf '%s\n' "$NEW"
  cron_begin "$ID" "$SLUG" "active"
  printf '%s %s >> %s 2>&1\n' "$CRON" "$CMD" "$LOG"
  cron_end "$ID"
} | cron_load

printf 'Scheduled %s\n' "$SLUG"
printf '  cron       : %s\n' "$CRON"
printf '  timezone   : %s\n' "${SPEC_TZ:-system}"
printf '  spec       : %s\n' "$SPEC"
printf '  cron block : id=%s status=active\n' "$ID"
printf '  log        : %s\n' "$LOG"
