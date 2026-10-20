#!/usr/bin/env bash
# schedule-delayed.sh — schedule a one-shot delayed run via cron.
#
# Usage:
#   schedule-delayed.sh --spec /path/to/spec.md --at "2026-05-09 08:00"
#
# Writes a managed cron block that:
#   1. waits until the absolute target time
#   2. runs run-task.sh once
#   3. removes its own cron block on success
#
# Implementation: the cron entry matches the target minute/hour/day/month. The
# command checks a stamp file and removes its own block after firing, so we get
# one-and-done semantics without `at`.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

SPEC="" AT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--spec) SPEC="$2"; shift 2 ;;
    -A|--at)   AT="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -f "$SPEC" ]] || die "spec not found: $SPEC" 1
[[ -n "$AT" ]]   || die "--at is required (e.g. \"2026-05-09 08:00\")" 2

# date -d only on GNU coreutils. Convert to epoch and to cron fields.
EPOCH="$(date -d "$AT" +%s 2>/dev/null)" || die "could not parse --at value: $AT"
MIN="$(date -d "@$EPOCH" +%M)"
HOUR="$(date -d "@$EPOCH" +%H)"
DOM="$(date -d "@$EPOCH" +%d)"
MON="$(date -d "@$EPOCH" +%m)"
DOW="*"

SLUG="$(fm_get task_slug "$SPEC")"
[[ -n "$SLUG" ]] || SLUG="$(slugify "$(fm_get title "$SPEC")")"
ID="delayed-${SLUG}-$(date -d "@$EPOCH" +%Y%m%d-%H%M)"
STAMP="$AO_RUNS/.delayed-${ID}.fired"

# Self-removing wrapper: run task, then delete this cron block.
WRAPPER="$(cat <<EOF
test -f $STAMP && exit 0; \
touch $STAMP && \
AO_HOME=$AO_HOME $AO_SKILL_DIR/bin/run-task.sh --task $SPEC >> $AO_RUNS/cron.${SLUG}.log 2>&1; \
( crontab -l 2>/dev/null | awk -v id="$ID" 'BEGIN{s=0} /^# AGENT-ORCHESTRATOR TASK BEGIN id="$ID"/{s=1;next} s && /^# AGENT-ORCHESTRATOR TASK END id="$ID"/{s=0;next} !s{print}' | crontab - )
EOF
)"

NEW="$(cron_dump | cron_strip_block "$ID")"
{
  printf '%s\n' "$NEW"
  cron_begin "$ID" "$SLUG" "active"
  printf '%s %s %s %s %s %s\n' "$MIN" "$HOUR" "$DOM" "$MON" "$DOW" "$WRAPPER"
  cron_end "$ID"
} | cron_load

printf 'Scheduled delayed run\n'
printf '  spec  : %s\n' "$SPEC"
printf '  fires : %s\n' "$(date -d "@$EPOCH" -Is)"
printf '  cron  : %s %s %s %s %s\n' "$MIN" "$HOUR" "$DOM" "$MON" "$DOW"
printf '  id    : %s\n' "$ID"
