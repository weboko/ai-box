#!/usr/bin/env bash
# disable-recurring.sh — disable (or resume) a managed recurring cron block.
#
# Usage:
#   disable-recurring.sh --slug <task-slug>            # disable
#   disable-recurring.sh --slug <task-slug> --resume   # re-enable
#
# Disable: comments the cron command line inside the block and updates
# the BEGIN comment's status= to "disabled". Resume: reverses both.
# Currently running agents are NOT touched.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

SLUG="" RESUME=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--slug)   SLUG="$2"; shift 2 ;;
       --resume) RESUME=1; shift ;;
    -h|--help)   sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -n "$SLUG" ]] || die "--slug is required" 2
need crontab; need awk

# Toggle the block in-place. Match the BEGIN line by slug=, then mutate
# everything until the matching END line.
NEW="$(cron_dump | awk -v slug="$SLUG" -v resume="$RESUME" '
  BEGIN { in_block=0 }
  /^# AGENT-ORCHESTRATOR TASK BEGIN/ {
    if (index($0, "slug="slug" ") || index($0, "slug="slug"\n") || $0 ~ ("slug="slug"$")) {
      in_block = 1
      if (resume == 1) { sub(/status=disabled/, "status=active") }
      else             { sub(/status=active/, "status=disabled") }
      print; next
    }
  }
  in_block && /^# AGENT-ORCHESTRATOR TASK END/ { in_block=0; print; next }
  in_block {
    if (resume == 1) {
      # Strip a single leading "# " from the command line (if disabled).
      sub(/^# /, "")
    } else {
      # Comment the command line if not already commented.
      if ($0 !~ /^# /) { $0 = "# " $0 }
    }
    print; next
  }
  { print }
')"

printf '%s\n' "$NEW" | cron_load

if [[ "$RESUME" -eq 1 ]]; then
  printf 'Resumed recurring task: %s\n' "$SLUG"
else
  printf 'Disabled recurring task: %s\n' "$SLUG"
  printf 'Currently running instances were left untouched.\n'
  printf 'To kill a running run as well: status.sh --kill <run-id>\n'
fi
