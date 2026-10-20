#!/usr/bin/env bash
# finalize-run.sh — detect a finished run, copy its report to
# workspace/reports/, and (for one-offs) move the spec to backlog/done/.
#
# Usage:
#   finalize-run.sh --run-id 20260508-103012
#   finalize-run.sh --latest
#   finalize-run.sh --all-eligible       # finalize every finished run
#
# Idempotent: re-running on an already-finalized run is a no-op.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

RUN_ID="" LATEST=0 ALL=0
while [[ $# -gt 0 ]]; do
  case "$1" in
       --run-id) RUN_ID="$2"; shift 2 ;;
       --latest) LATEST=1; shift ;;
       --all-eligible) ALL=1; shift ;;
    -h|--help)   sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

ensureDirs
need jq

finalize_one() {
  local rid="$1"
  local rdir="$AO_RUNS/$rid"
  local rj="$rdir/run.json"
  [[ -f "$rj" ]] || { log "no run.json for $rid; skipping"; return 0; }

  local pid status
  pid="$(jq -r .pid "$rj")"
  status="$(jq -r .status "$rj")"

  # Still running?
  if [[ -n "$pid" && "$pid" != "null" ]] && kill -0 "$pid" 2>/dev/null; then
    log "$rid still running (PID $pid); skipping"
    return 0
  fi

  if [[ "$status" == "done" || "$status" == "failed" || "$status" == "finalized" ]]; then
    log "$rid already finalized"
    return 0
  fi

  local agent slug task_file
  agent="$(jq -r .agent "$rj")"
  slug="$(jq -r .task_slug "$rj")"
  task_file="$(jq -r .task_file "$rj")"

  # Copy report if present.
  local report="$rdir/report.md"
  local outcome
  if [[ -f "$report" ]]; then
    local dest="$AO_REPORTS/${slug}_${rid}_${agent}.md"
    cp -f "$report" "$dest"
    outcome="done"
    log "$rid → copied report to $dest"
  else
    outcome="failed"
    log "$rid → no report.md; marking failed"
  fi

  # For one-off backlog tasks, move the source spec to backlog/done/.
  if [[ -f "$task_file" ]]; then
    local typ; typ="$(fm_get type "$task_file" 2>/dev/null || echo one-off)"
    if [[ "$typ" == "one-off" ]]; then
      local src_dir; src_dir="$(dirname "$task_file")"
      if [[ "$src_dir" == "$AO_BACKLOG" ]]; then
        mv -f "$task_file" "$AO_BACKLOG/done/"
        log "$rid → moved $(basename "$task_file") to backlog/done/"
      fi
    fi
  fi

  # Update run.json + index.
  local tmp; tmp="$(mktemp)"
  jq --arg s "$outcome" --arg t "$(isoNow)" \
     '.status=$s | .finalized_at=$t' "$rj" > "$tmp" && mv "$tmp" "$rj"
  index_upsert "$(cat "$rj")"
}

if [[ "$LATEST" -eq 1 ]]; then
  RUN_ID="$(index_latest | jq -r .run_id)"
fi

if [[ "$ALL" -eq 1 ]]; then
  while IFS= read -r rid; do
    finalize_one "$rid"
  done < <(jq -r '.[] | select(.status == "running") | .run_id' "$AO_INDEX")
elif [[ -n "$RUN_ID" && "$RUN_ID" != "null" ]]; then
  finalize_one "$RUN_ID"
else
  die "specify --run-id, --latest, or --all-eligible" 2
fi
