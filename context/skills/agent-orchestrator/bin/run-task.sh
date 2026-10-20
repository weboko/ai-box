#!/usr/bin/env bash
# run-task.sh — launch a task spec now.
#
# Usage:
#   run-task.sh --task SPEC.md [--agent claude|codex] [--repo owner/repo] [--print-meta]
#
# Where the agent works depends on the spec's mode:
#   pr     fresh worktree + branch from the base clone; the agent opens a PR
#   push   persistent clone in the workdir (created on GitHub first if create_repo: true)
#   local  persistent local git repo in the workdir, no remote
# Then: agent-task.md (spec + contract + delivery rules) → run.json → run-agent.sh.
# --print-meta prints run.json instead of the human summary.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

TASK="" AGENT="" REPO="" PRINT_META=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--task)       TASK="$2"; shift 2 ;;
    -a|--agent)      AGENT="$2"; shift 2 ;;
    -r|--repo)       REPO="$2"; shift 2 ;;
       --print-meta) PRINT_META=1; shift ;;
    -h|--help)       sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -n "$TASK" ]] || die "--task is required" 2
[[ -f "$TASK" ]] || die "task file not found: $TASK" 1
TASK="$(readlink -f "$TASK")"

need jq; need git
ensureDirs

# CLI flag → spec frontmatter → config default.
[[ -n "$AGENT" ]] || AGENT="$(fm_get agent "$TASK")"
[[ -n "$AGENT" ]] || AGENT="$(cfg default_agent claude)"
need_agent "$AGENT"

[[ -n "$REPO" ]] || REPO="$(fm_get repo "$TASK")"
MODE="$(spec_mode "$TASK" "$REPO")"
SLUG="$(spec_slug "$TASK")"

if [[ "$MODE" != local ]]; then
  need gh
  CREATE=0; [[ "$(fm_get create_repo "$TASK")" == true ]] && CREATE=1
  VISIBILITY="$(fm_get visibility "$TASK")"
  REPO="$(resolve_repo "$REPO" "$CREATE" "${VISIBILITY:-private}")"
fi

# Persistent workspaces take one run at a time.
if [[ "$MODE" != pr ]]; then
  WORKDIR="$(spec_workdir "$TASK" "$SLUG")"
  BUSY="$(workdir_busy "$WORKDIR")"
  [[ -z "$BUSY" ]] || die "workdir $WORKDIR is in use by run $BUSY (still running); not starting another"
fi

# Run ids are per-second; wait out a collision rather than share a folder.
RUN_ID="$(runId)"
while [[ -e "$AO_RUNS/$RUN_ID" ]]; do sleep 1; RUN_ID="$(runId)"; done
RUN_DIR="$AO_RUNS/$RUN_ID"
mkdir -p "$RUN_DIR"
cp "$TASK" "$RUN_DIR/task.md"

BASE=""
case "$MODE" in
  pr)
    BASE="$(ensure_base_repo "$REPO")"
    WORKDIR="$RUN_DIR/worktree"
    BRANCH="$(create_worktree "$BASE" "$AGENT" "$SLUG" "$RUN_ID" "$WORKDIR")"
    ;;
  push)
    ensure_workspace push "$REPO" "$WORKDIR"
    BRANCH="$(default_branch "$WORKDIR")"
    ;;
  local)
    ensure_workspace local "" "$WORKDIR"
    BRANCH="$(git -C "$WORKDIR" symbolic-ref --short HEAD 2>/dev/null || echo main)"
    ;;
esac

build_agent_task "$RUN_DIR/task.md" "$RUN_DIR/agent-task.md" "$MODE" \
  "RUN_ID=$RUN_ID" "AGENT=$AGENT" "TASK_SLUG=$SLUG" "MODE=$MODE" \
  "REPO=${REPO:-none (local only)}" "BRANCH=$BRANCH" "DEFAULT_BRANCH=$BRANCH" \
  "RUN_DIR=$RUN_DIR" "WORKDIR=$WORKDIR"

# run.json exists before the agent starts, so a fast agent can always be finalized.
jq -n \
  --arg run_id "$RUN_ID" --arg task_slug "$SLUG" --arg agent "$AGENT" --arg mode "$MODE" \
  --arg task_file "$TASK" --arg repo "$REPO" --arg base_repo_path "$BASE" \
  --arg workdir "$WORKDIR" --arg branch "$BRANCH" --arg created_at "$(isoNow)" \
  '{run_id:$run_id, task_slug:$task_slug, agent:$agent, mode:$mode, task_file:$task_file,
    repo:$repo, base_repo_path:$base_repo_path, workdir:$workdir,
    branch:$branch, status:"running", created_at:$created_at}' \
  > "$RUN_DIR/run.json"

if ! PID="$("$AO_BIN/run-agent.sh" --agent "$AGENT" --run-dir "$RUN_DIR" --workdir "$WORKDIR")"; then
  run_json_set "$RUN_ID" '.status = "failed"'
  die "agent failed to start; run folder kept at $RUN_DIR"
fi

if [[ "$PRINT_META" -eq 1 ]]; then
  cat "$RUN_DIR/run.json"
else
  printf 'Started %s (PID %s)\n' "$AGENT" "$PID"
  printf '  run_id  : %s\n' "$RUN_ID"
  printf '  mode    : %s\n' "$MODE"
  printf '  repo    : %s\n' "${REPO:-none}"
  printf '  branch  : %s\n' "$BRANCH"
  printf '  workdir : %s\n' "$WORKDIR"
  printf '  log     : %s\n' "$RUN_DIR/agent.log"
fi
