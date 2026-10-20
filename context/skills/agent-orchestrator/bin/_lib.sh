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
AO_WORKSPACES="$AO_HOME/workspaces"
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
  mkdir -p "$AO_BACKLOG/done" "$AO_SCHEDULED" "$AO_REPORTS" "$AO_REPOS" "$AO_WORKSPACES" "$AO_RUNS"
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

# spec_mode SPEC [REPO] — pr (existing repo, worktree + PR), push (persistent clone,
# commits to the default branch) or local (persistent local git repo, no remote).
# Defaults to pr when there is a repo, local otherwise.
spec_mode() {
  local spec="$1" repo="${2:-}" mode
  [[ -n "$repo" ]] || repo="$(fm_get repo "$spec")"
  mode="$(fm_get mode "$spec")"
  if [[ -z "$mode" ]]; then
    if [[ -n "$repo" ]]; then mode=pr; else mode=local; fi
  fi
  case "$mode" in
    pr|push) [[ -n "$repo" ]] || die "mode $mode needs repo: in the spec" ;;
    local)   [[ "$(fm_get create_repo "$spec")" != true ]] \
               || die "create_repo needs mode push or pr; local tasks have no remote" ;;
    *)       die "invalid mode: $mode (expected pr, push or local)" ;;
  esac
  printf '%s\n' "$mode"
}

# Persistent folder for push/local tasks: workdir: from the spec, else workspaces/<slug>.
spec_workdir() {
  local dir
  dir="$(fm_get workdir "$1")"
  dir="${dir/#\~/$HOME}"
  printf '%s\n' "${dir:-$AO_WORKSPACES/$2}"
}

# ---- slugs and repos ----------------------------------------------------------
slugify() {
  # slugify "Some Title!" → "some-title"
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' \
    | cut -c1-60
}

# "owner/repo" from a GitHub URL (https, ssh or scp-style); other input unchanged.
repo_from_url() {
  printf '%s\n' "$1" | sed -E 's#^(https?://|ssh://git@|git@)github\.com[:/]##; s#\.git$##; s#/$##'
}

# resolve_repo INPUT [CREATE] [VISIBILITY] — normalize to "owner/repo". A bare name is
# looked up under github_user, then default_org. With CREATE=1 a repo that doesn't exist
# is created (bare names under github_user, else the gh login), private unless VISIBILITY
# says public.
resolve_repo() {
  local input="$1" create="${2:-0}" visibility="${3:-private}" repo="" owner gh_user gh_org
  case "$input" in
    http://*|https://*|git@*|ssh://*) repo="$(repo_from_url "$input")" ;;
    */*) repo="$input" ;;
    *)
      gh_user="$(cfg github_user "")"
      gh_org="$(cfg default_org "")"
      for owner in "$gh_user" "$gh_org"; do
        [[ -z "$owner" ]] && continue
        if gh repo view "$owner/$input" >/dev/null 2>&1; then repo="$owner/$input"; break; fi
      done
      if [[ -z "$repo" ]]; then
        [[ "$create" == 1 ]] \
          || die "could not resolve repo '$input'. Tried github_user='$gh_user', default_org='$gh_org'. Provide owner/repo or a URL."
        owner="${gh_user:-$(gh api user --jq .login 2>/dev/null || true)}"
        [[ -n "$owner" ]] || die "can't tell which GitHub user to create '$input' under; set github_user in config.json"
        repo="$owner/$input"
      fi
      ;;
  esac
  if [[ "$create" == 1 ]] && ! gh repo view "$repo" >/dev/null 2>&1; then
    case "$visibility" in private|public) ;; *) die "visibility must be private or public, not '$visibility'" ;; esac
    log "creating $visibility GitHub repo $repo"
    gh repo create "$repo" "--$visibility" --add-readme >&2 \
      || die "failed to create $visibility GitHub repo $repo"
  fi
  printf '%s\n' "$repo"
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

# ensure_workspace MODE REPO DIR — the persistent folder push/local runs work in.
# push: a clone of REPO (cloned on first use; refuses a folder cloned from elsewhere).
# local: a git repo with no remote. Never pulls — the agent syncs as its first step.
ensure_workspace() {
  local mode="$1" repo="$2" dir="$3" origin
  if [[ "$mode" == push ]]; then
    if [[ -d "$dir/.git" ]]; then
      # The configured URL, not `remote get-url`, which expands insteadOf rewrites.
      origin="$(git -C "$dir" config --get remote.origin.url || true)"
      [[ "$(repo_from_url "$origin")" == "$repo" ]] \
        || die "workdir $dir is a clone of '${origin:-nothing}', not $repo"
    else
      [[ ! -e "$dir" || -z "$(ls -A "$dir")" ]] || die "workdir $dir exists but isn't a clone of $repo"
      mkdir -p "$(dirname "$dir")"
      log "cloning $repo to $dir"
      gh repo clone "$repo" "$dir" >&2
    fi
  else
    mkdir -p "$dir"
    if [[ ! -d "$dir/.git" ]]; then
      log "creating local git repo in $dir"
      git -C "$dir" init -q -b main >&2
    fi
  fi
}

# Id of a live run working in DIR, if any — two runs never share a workspace.
workdir_busy() {
  local dir="$1" rid
  for rid in $(run_ids); do
    [[ "$(jq -r '.workdir // empty' "$AO_RUNS/$rid/run.json")" == "$dir" ]] || continue
    if [[ "$(run_status "$rid")" == running ]]; then printf '%s\n' "$rid"; return 0; fi
  done
}

# ---- agent-task.md assembly ---------------------------------------------------
# build_agent_task SPEC OUT MODE KEY=VALUE… — the spec, then the common contract, then the
# delivery rules for MODE, with {{KEY}} placeholders filled in.
build_agent_task() {
  local spec="$1" out="$2" mode="$3" kv
  shift 3
  local subst=()
  for kv in "$@"; do subst+=(-e "s|{{${kv%%=*}}}|${kv#*=}|g"); done
  local contract="$AO_TEMPLATES/contract.md" delivery="$AO_TEMPLATES/delivery-$mode.md"
  [[ -f "$contract" && -f "$delivery" ]] || die "contract templates missing in $AO_TEMPLATES"
  { cat "$spec"; printf '\n\n'; cat "$contract"; printf '\n'; cat "$delivery"; } \
    | sed "${subst[@]}" > "$out"
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
