#!/usr/bin/env bash
# run-task.sh — launch a task spec now.
#
# Usage:
#   run-task.sh --task SPEC.md [--agent claude|codex] [--repo owner/repo] [--print-meta]
#
# Steps: resolve agent + repo → ensure base clone → worktree on a fresh branch →
# agent-task.md (spec + contract) → run.json → run-agent.sh.
# --print-meta prints run.json instead of the human summary.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

TASK="" AGENT="" REPO="" PRINT_META=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--task)       TASK="$2"; shift 2 ;;
    -a|--agent)      AGENT="$2"; shift 2 ;;
    -r|--repo)       REPO="$2"; shift 2 ;;
       --print-meta) PRINT_META=1; shift ;;
    -h|--help)       sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -n "$TASK" ]] || die "--task is required" 2
[[ -f "$TASK" ]] || die "task file not found: $TASK" 1
TASK="$(readlink -f "$TASK")"

need jq; need git; need gh
ensureDirs

# CLI flag → spec frontmatter → config default.
[[ -n "$AGENT" ]] || AGENT="$(fm_get agent "$TASK")"
[[ -n "$AGENT" ]] || AGENT="$(cfg default_agent claude)"
need_agent "$AGENT"

[[ -n "$REPO" ]] || REPO="$(fm_get repo "$TASK")"
[[ -n "$REPO" ]] || die "no repository (set --repo or repo: in the spec)"
REPO="$(resolve_repo "$REPO")"

SLUG="$(spec_slug "$TASK")"

# Run ids are per-second; wait out a collision rather than share a folder.
RUN_ID="$(runId)"
while [[ -e "$AO_RUNS/$RUN_ID" ]]; do sleep 1; RUN_ID="$(runId)"; done
RUN_DIR="$AO_RUNS/$RUN_ID"
WORKTREE="$RUN_DIR/worktree"
mkdir -p "$RUN_DIR"
cp "$TASK" "$RUN_DIR/task.md"

BASE="$(ensure_base_repo "$REPO")"
BRANCH="$(create_worktree "$BASE" "$AGENT" "$SLUG" "$RUN_ID" "$WORKTREE")"
build_agent_task "$RUN_DIR/task.md" "$RUN_DIR/agent-task.md" \
  "$RUN_ID" "$AGENT" "$SLUG" "$REPO" "$BRANCH" "$RUN_DIR" "$WORKTREE"

# run.json exists before the agent starts, so a fast agent can always be finalized.
jq -n \
  --arg run_id "$RUN_ID" --arg task_slug "$SLUG" --arg agent "$AGENT" \
  --arg task_file "$TASK" --arg repo "$REPO" --arg base_repo_path "$BASE" \
  --arg worktree_path "$WORKTREE" --arg branch "$BRANCH" --arg created_at "$(isoNow)" \
  '{run_id:$run_id, task_slug:$task_slug, agent:$agent, task_file:$task_file,
    repo:$repo, base_repo_path:$base_repo_path, worktree_path:$worktree_path,
    branch:$branch, status:"running", created_at:$created_at}' \
  > "$RUN_DIR/run.json"

if ! PID="$("$AO_BIN/run-agent.sh" --agent "$AGENT" --run-dir "$RUN_DIR")"; then
  run_json_set "$RUN_ID" '.status = "failed"'
  die "agent failed to start; run folder kept at $RUN_DIR"
fi

if [[ "$PRINT_META" -eq 1 ]]; then
  cat "$RUN_DIR/run.json"
else
  printf 'Started %s (PID %s)\n' "$AGENT" "$PID"
  printf '  run_id   : %s\n' "$RUN_ID"
  printf '  repo     : %s\n' "$REPO"
  printf '  branch   : %s\n' "$BRANCH"
  printf '  worktree : %s\n' "$WORKTREE"
  printf '  log      : %s\n' "$RUN_DIR/agent.log"
fi
