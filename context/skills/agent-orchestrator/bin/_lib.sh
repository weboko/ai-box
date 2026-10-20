#!/usr/bin/env bash
# _lib.sh — shared helpers for agent-orchestrator scripts. Source, don't execute.
#
#   . "$(dirname "$(readlink -f "$0")")/_lib.sh"

set -Eeuo pipefail

# All runtime state lives under one root.
AO_HOME="${AO_HOME:-$HOME/.agent-orchestrator}"
AO_BACKLOG="$AO_HOME/backlog"
AO_SCHEDULED="$AO_HOME/scheduled"
AO_REPORTS="$AO_HOME/reports"
AO_REPOS="$AO_HOME/repos"
AO_RUNS="$AO_HOME/runs"
AO_CONFIG="$AO_HOME/config.json"
AO_SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AO_BIN="$AO_SKILL_DIR/bin"
AO_TEMPLATES="$AO_SKILL_DIR/templates"

log()    { printf '%s [%s] %s\n' "$(date -Is)" "${0##*/}" "$*" >&2; }
die()    { log "ERROR: $*"; exit "${2:-1}"; }
need()   { command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"; }
isoNow() { date -Is; }
runId()  { date +%Y%m%d-%H%M%S; }

cfg() {
  # cfg KEY [DEFAULT] — read top-level key from config.json (empty → DEFAULT)
  local key="$1" def="${2:-}"
  if [[ -f "$AO_CONFIG" ]]; then
    jq -r --arg k "$key" --arg d "$def" '(.[$k] // $d) | if . == "" then $d else . end' "$AO_CONFIG"
  else
    printf '%s\n' "$def"
  fi
}

ensureDirs() {
  mkdir -p "$AO_BACKLOG/done" "$AO_SCHEDULED" "$AO_REPORTS" "$AO_REPOS" "$AO_RUNS"
}

# ---- agents -------------------------------------------------------------------
agent_install_hint() {
  case "$1" in
    claude) echo "npm install -g @anthropic-ai/claude-code" ;;
    codex)  echo "npm install -g @openai/codex" ;;
  esac
}

need_agent() {
  case "$1" in claude|codex) ;; *) die "invalid agent: $1 (expected claude or codex)" 2 ;; esac
  command -v "$1" >/dev/null 2>&1 \
    || die "agent binary not found: $1. Install hint: $(agent_install_hint "$1"). No run was started."
}

# ---- frontmatter --------------------------------------------------------------
# Simple `key: value` lines between the leading `---` markers; quotes are stripped.
fm_get() {
  local key="$1" file="$2"
  awk -v k="$key" '
    /^---[[:space:]]*$/ { if (++n == 2) exit; next }
    n == 1 && $0 ~ "^"k"[[:space:]]*:" {
      sub("^"k"[[:space:]]*:[[:space:]]*", ""); gsub(/^"|"$/, ""); print; exit
    }
  ' "$file"
}

# Set (or add) a frontmatter key in place.
fm_set() {
  local key="$1" val="$2" file="$3" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$val" '
    /^---[[:space:]]*$/ {
      if (++n == 2 && !done) { print k ": \"" v "\""; done = 1 }
      print; next
    }
    n == 1 && $0 ~ "^"k"[[:space:]]*:" { if (!done) print k ": \"" v "\""; done = 1; next }
    { print }
  ' "$file" > "$tmp" && cat "$tmp" > "$file" && rm -f "$tmp"
}

spec_slug() {
  local slug
  slug="$(fm_get slug "$1")"
  [[ -n "$slug" ]] || slug="$(slugify "$(fm_get title "$1")")"
  [[ -n "$slug" ]] || die "spec has neither slug nor title: $1"
  printf '%s\n' "$slug"
}

# ---- slugs and repos ----------------------------------------------------------
slugify() {
  # slugify "Some Title!" → "some-title"
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' \
    | cut -c1-60
}

# Normalize repo input → "owner/repo". Resolves URL or bare-name forms.
resolve_repo() {
  local input="$1"
  case "$input" in
    https://github.com/*|http://github.com/*)
      printf '%s\n' "$input" | sed -E 's#^https?://github\.com/##; s#\.git$##; s#/$##'
      return 0 ;;
    */*)
      printf '%s\n' "$input"
      return 0 ;;
  esac
  # Bare name — try configured user, then default org.
  local gh_user gh_org
  gh_user="$(cfg github_user "")"
  gh_org="$(cfg default_org "")"
  for owner in "$gh_user" "$gh_org"; do
    [[ -z "$owner" ]] && continue
    if gh repo view "$owner/$input" >/dev/null 2>&1; then
      printf '%s/%s\n' "$owner" "$input"
      return 0
    fi
  done
  die "could not resolve repo '$input'. Tried github_user='$gh_user', default_org='$gh_org'. Provide owner/repo or a URL."
}

# Ensure base clone exists and is up to date. Echoes the base path.
ensure_base_repo() {
  local repo="$1" owner="${1%%/*}" name="${1##*/}"
  local base="$AO_REPOS/$owner/$name"
  mkdir -p "$AO_REPOS/$owner"
  if [[ ! -d "$base/.git" ]]; then
    log "cloning $repo to $base"
    gh repo clone "$repo" "$base" >&2
  else
    log "fetching $repo"
    git -C "$base" fetch --all --prune >&2
  fi
  printf '%s\n' "$base"
}

default_branch() {
  local base="$1"
  git -C "$base" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null \
    | sed 's#^origin/##' \
    || echo main
}

# Add a worktree at TARGET on a fresh branch. Echoes the branch name.
create_worktree() {
  local base="$1" agent="$2" slug="$3" run_id="$4" target="$5"
  local branch default
  branch="$(cfg branch_prefix agent)/${agent}/${slug}-${run_id}"
  default="$(default_branch "$base")"
  log "creating worktree $target on branch $branch from origin/$default"
  git -C "$base" worktree add -b "$branch" "$target" "origin/$default" >&2
  printf '%s\n' "$branch"
}

# ---- agent-task.md assembly ---------------------------------------------------
build_agent_task() {
  # build_agent_task SPEC OUT RUN_ID AGENT SLUG REPO BRANCH RUN_DIR WORKTREE
  local spec="$1" out="$2" run_id="$3" agent="$4" slug="$5" repo="$6" branch="$7"
  local run_dir="$8" worktree="$9"
  local contract="$AO_TEMPLATES/agent-task-contract.md"
  [[ -f "$contract" ]] || die "contract template missing: $contract"
  {
    cat "$spec"
    echo
    echo
    sed \
      -e "s|{{RUN_ID}}|$run_id|g" \
      -e "s|{{AGENT}}|$agent|g" \
      -e "s|{{TASK_SLUG}}|$slug|g" \
      -e "s|{{REPO}}|$repo|g" \
      -e "s|{{BRANCH}}|$branch|g" \
      -e "s|{{RUN_DIR}}|$run_dir|g" \
      -e "s|{{WORKTREE}}|$worktree|g" \
      "$contract"
  } > "$out"
}

# ---- runs ---------------------------------------------------------------------
# Each run is a folder runs/<run-id>/ with run.json; there is no separate index.

# Run ids, newest first.
run_ids() {
  local f
  for f in "$AO_RUNS"/*/run.json; do
    if [[ -f "$f" ]]; then basename "$(dirname "$f")"; fi
  done | sort -r
}

latest_run_id() { run_ids | sed -n 1p; }

pid_alive() { [[ -n "${1:-}" ]] && kill -0 "$1" 2>/dev/null; }

run_pid() { cat "$AO_RUNS/$1/agent.pid" 2>/dev/null || true; }

# running | done | failed | killed | exited (process gone, never finalized)
run_status() {
  local rid="$1" status
  status="$(jq -r .status "$AO_RUNS/$rid/run.json")"
  if [[ "$status" == running ]] && ! pid_alive "$(run_pid "$rid")"; then
    status=exited
  fi
  printf '%s\n' "$status"
}

run_json_set() {
  # run_json_set RUN_ID JQ_FILTER [jq args…]
  local rj="$AO_RUNS/$1/run.json" filter="$2" tmp
  shift 2
  tmp="$(mktemp)"
  jq "$@" "$filter" "$rj" > "$tmp" && mv "$tmp" "$rj"
}

# ---- crontab ------------------------------------------------------------------
# One managed block, regenerated wholesale by `schedule.sh sync`.
CRON_BEGIN="# BEGIN agent-orchestrator (generated by schedule.sh sync; edit the specs, not this block)"
CRON_END="# END agent-orchestrator"

cron_dump() { crontab -l 2>/dev/null || true; }
cron_load() { crontab -; }

cron_without_block() {
  cron_dump | awk '/^# BEGIN agent-orchestrator/ { s = 1 } !s { print } /^# END agent-orchestrator/ { s = 0 }'
}

cron_daemon_running() { pgrep -x cron >/dev/null 2>&1 || pgrep -x crond >/dev/null 2>&1; }
