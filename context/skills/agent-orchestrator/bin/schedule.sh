#!/usr/bin/env bash
# schedule.sh — manage scheduled tasks. Specs in $AO_HOME/scheduled/ are the source
# of truth; the crontab block is generated from them.
#
# Usage:
#   schedule.sh add SPEC.md      # copy into scheduled/<slug>.md (needs cron: or run_at:), activate
#   schedule.sh disable SLUG     # status: stopped — running agents are NOT touched
#   schedule.sh resume SLUG      # status: active
#   schedule.sh remove SLUG      # delete the scheduled spec
#   schedule.sh list             # what's scheduled, last run, cron daemon state
#   schedule.sh sync             # rewrite the crontab block from the specs
#
# Times are machine-local. `cron: "0 9 * * 1"` repeats; `run_at: "2030-01-02 08:30"`
# fires once, after which the spec moves to backlog/done/.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

usage() { sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; }

spec_for() {
  local spec="$AO_SCHEDULED/$1.md"
  [[ -f "$spec" ]] || die "no scheduled task with slug '$1' (see: schedule.sh list)"
  printf '%s\n' "$spec"
}

# Cron fields for a spec, or empty if it shouldn't fire.
cron_expr() {
  local spec="$1" cron at epoch
  cron="$(fm_get cron "$spec")"
  at="$(fm_get run_at "$spec")"
  if [[ -n "$cron" ]]; then
    printf '%s\n' "$cron"
  elif [[ -n "$at" ]]; then
    epoch="$(date -d "$at" +%s)" || { log "skipping $spec: can't parse run_at '$at'"; return 0; }
    if (( epoch <= $(date +%s) )); then
      log "skipping $spec: run_at '$at' is in the past"
      return 0
    fi
    date -d "@$epoch" '+%-M %-H %-d %-m *'
  fi
}

sync() {
  need crontab
  ensureDirs
  local spec expr lines=()
  for spec in "$AO_SCHEDULED"/*.md; do
    [[ -f "$spec" && "$(fm_get status "$spec")" == active ]] || continue
    expr="$(cron_expr "$spec")"
    [[ -n "$expr" ]] || continue
    # Cron starts jobs with a bare environment; carry over what the agents need.
    # `%` is special in crontab lines.
    lines+=("$(printf '%s HOME=%q AO_HOME=%q PATH=%q %q %q >> %q 2>&1' \
      "$expr" "$HOME" "$AO_HOME" "$PATH" "$AO_BIN/run-scheduled.sh" "$spec" \
      "$AO_RUNS/cron.$(spec_slug "$spec").log" | sed 's/%/\\%/g')")
  done
  {
    cron_without_block
    if [[ ${#lines[@]} -gt 0 ]]; then
      printf '%s\n' "$CRON_BEGIN" "${lines[@]}" "$CRON_END"
    fi
  } | cron_load
  cron_daemon_running || log "warning: no cron daemon is running; scheduled tasks won't fire"
}

case "${1:-}" in
  add)
    SRC="${2:-}"
    [[ -f "$SRC" ]] || die "spec not found: $SRC" 2
    ensureDirs
    CRON="$(fm_get cron "$SRC")"
    AT="$(fm_get run_at "$SRC")"
    [[ -n "$CRON" || -n "$AT" ]] || die "spec needs cron: or run_at: in its frontmatter"
    [[ -z "$CRON" || -z "$AT" ]] || die "spec has both cron: and run_at:; keep one"
    [[ -z "$AT" ]] || date -d "$AT" +%s >/dev/null 2>&1 || die "can't parse run_at: $AT"
    SLUG="$(spec_slug "$SRC")"
    DEST="$AO_SCHEDULED/$SLUG.md"
    if [[ "$(readlink -f "$SRC")" != "$(readlink -f "$DEST")" ]]; then
      [[ ! -e "$DEST" ]] || die "slug '$SLUG' is already scheduled; remove it first or pick another slug"
      cp "$SRC" "$DEST"
    fi
    fm_set status active "$DEST"
    sync
    printf 'Scheduled %s (%s) — %s\n' "$SLUG" "${CRON:-once at $AT}" "$DEST"
    ;;
  disable|resume)
    SPEC="$(spec_for "${2:-}")"
    [[ "$1" == disable ]] && fm_set status stopped "$SPEC" || fm_set status active "$SPEC"
    sync
    if [[ "$1" == disable ]]; then
      printf 'Disabled %s. Running instances were left alone; kill one with status.sh --kill <run-id>.\n' "$2"
    else
      printf 'Resumed %s.\n' "$2"
    fi
    ;;
  remove)
    SPEC="$(spec_for "${2:-}")"
    rm -f "$SPEC"
    sync
    printf 'Removed %s. Running instances were left alone.\n' "$2"
    ;;
  list)
    ensureDirs
    printf '%-24s %-8s %-22s %s\n' SLUG STATUS SCHEDULE LAST_RUN
    for SPEC in "$AO_SCHEDULED"/*.md; do
      [[ -f "$SPEC" ]] || continue
      WHEN="$(fm_get cron "$SPEC")"
      [[ -n "$WHEN" ]] || WHEN="at $(fm_get run_at "$SPEC")"
      printf '%-24s %-8s %-22s %s\n' "$(spec_slug "$SPEC")" "$(fm_get status "$SPEC")" \
        "$WHEN" "$(fm_get last_run_id "$SPEC")"
    done
    cron_daemon_running || printf '\nwarning: no cron daemon is running; nothing will fire\n'
    ;;
  sync)    sync ;;
  -h|--help|"") usage ;;
  *) die "unknown command: $1 (see --help)" 2 ;;
esac
