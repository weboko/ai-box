#!/usr/bin/env bash
# run-task.sh — launch a one-off task spec.
#
# Usage:
#   run-task.sh --task /path/to/spec.md [--agent claude|codex]
#                        [--repo owner/repo] [--run-id YYYYMMDD-HHMMSS]
#                        [--print-meta]
#
# Steps: validate → resolve repo → ensure base clone → create worktree+branch →
# build agent-task.md → call run-agent.sh → record run.json + index entry.

. "$(dirname "$(readlink -f "$0")")/_lib.sh"

TASK="" AGENT="" REPO="" RUN_ID="" PRINT_META=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--task)    TASK="$2"; shift 2 ;;
    -a|--agent)   AGENT="$2"; shift 2 ;;
    -r|--repo)    REPO="$2"; shift 2 ;;
       --run-id)  RUN_ID="$2"; shift 2 ;;
       --print-meta) PRINT_META=1; shift ;;
    -h|--help)    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown flag: $1" 2 ;;
  esac
done

[[ -n "$TASK" ]] || die "--task is required" 2
[[ -f "$TASK" ]] || die "task file not found: $TASK" 1

need jq; need git; need gh
[[ -x "$AO_RUN_AGENT" ]] || die "run-agent.sh not executable: $AO_RUN_AGENT"

ensureDirs

# Resolve from spec if not overridden on the CLI.
[[ -n "$AGENT" ]] || AGENT="$(fm_get agent "$TASK")"
[[ -n "$AGENT" ]] || AGENT="$(cfg default_agent claude)"
case "$AGENT" in claude|codex) ;; *) die "invalid agent: $AGENT" 2 ;; esac

[[ -n "$REPO" ]] || REPO="$(fm_first_repo "$TASK")"
[[ -n "$REPO" ]] || die "no target repository (set --repo or add target_repositories: in spec)"
REPO="$(resolve_repo "$REPO")"

SLUG="$(fm_get task_slug "$TASK")"
if [[ -z "$SLUG" ]]; then
  TITLE="$(fm_get title "$TASK")"
  SLUG="$(slugify "${TITLE:-task}")"
fi

[[ -n "$RUN_ID" ]] || RUN_ID="$(runId)"
RUN_DIR="$AO_RUNS/$RUN_ID"
WORKTREE="$RUN_DIR/worktree"
LOG_FILE="$RUN_DIR/${SLUG}.${AGENT}.${RUN_ID}.log"
PID_FILE="${LOG_FILE}.pid"
AGENT_TASK="$RUN_DIR/agent-task.md"

mkdir -p "$RUN_DIR"
cp "$TASK" "$RUN_DIR/task.md"

BASE="$(ensure_base_repo "$REPO")"

# create_worktree echoes "branch\nworktree" — capture both.
mapfile -t WT < <(create_worktree "$BASE" "$AGENT" "$SLUG" "$RUN_ID" "$WORKTREE")
BRANCH="${WT[0]}"

build_agent_task "$RUN_DIR/task.md" "$AGENT_TASK" "$RUN_ID" "$AGENT" "$SLUG" "$REPO" "$BRANCH" "$RUN_DIR" "$WORKTREE"

# Run from the worktree so relative paths inside the repo resolve naturally.
cd "$WORKTREE" || die "could not cd into worktree: $WORKTREE"
META="$("$AO_RUN_AGENT" \
  --agent "$AGENT" \
  --task "$AGENT_TASK" \
  --log "$LOG_FILE" \
  --run-id "$RUN_ID" \
  --print-meta)"

PID="$(jq -r .pid <<<"$META")"

# Record run.json + index entry.
RUN_JSON="$RUN_DIR/run.json"
jq -n \
  --arg run_id "$RUN_ID" \
  --arg task_slug "$SLUG" \
  --arg agent "$AGENT" \
  --arg task_file "$TASK" \
  --arg run_dir "$RUN_DIR" \
  --arg repo "$REPO" \
  --arg base_repo_path "$BASE" \
  --arg worktree_path "$WORKTREE" \
  --arg branch "$BRANCH" \
  --arg log_file "$LOG_FILE" \
  --arg pid_file "$PID_FILE" \
  --argjson pid "$PID" \
  --arg status "running" \
  --arg created_at "$(isoNow)" \
  '{run_id:$run_id, task_slug:$task_slug, agent:$agent, task_file:$task_file,
    run_dir:$run_dir, repo:$repo, base_repo_path:$base_repo_path,
    worktree_path:$worktree_path, branch:$branch, log_file:$log_file,
    pid_file:$pid_file, pid:$pid, status:$status, created_at:$created_at}' \
  > "$RUN_JSON"

index_upsert "$(cat "$RUN_JSON")"

if [[ "$PRINT_META" -eq 1 ]]; then
  cat "$RUN_JSON"
else
  printf 'Started %s (PID %s)\n' "$AGENT" "$PID"
  printf '  run_id   : %s\n' "$RUN_ID"
  printf '  repo     : %s\n' "$REPO"
  printf '  branch   : %s\n' "$BRANCH"
  printf '  worktree : %s\n' "$WORKTREE"
  printf '  log      : %s\n' "$LOG_FILE"
  printf '  pid file : %s\n' "$PID_FILE"
fi
