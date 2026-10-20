#!/usr/bin/env bash
# _lib.sh — shared helpers for agent-orchestrator wrappers. Source, don't execute.
#
#   . "$(dirname "$0")/_lib.sh"

set -Eeuo pipefail

# Cron starts with a minimal PATH, which can hide user-installed tools such as
# jq, gh, claude, codex, npm/node, and Homebrew binaries. Keep the wrappers
# self-contained so recurring tasks behave like interactive runs.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.cargo/bin:$HOME/.nix-profile/bin:$HOME/bin:/usr/local/bin:/opt/homebrew/bin:/home/linuxbrew/.linuxbrew/bin:${PATH:-/usr/bin:/bin}"

# All runtime state lives under one root; each piece can be overridden.
AO_HOME="${AO_HOME:-$HOME/.agent-orchestrator}"
AO_BACKLOG="${AO_BACKLOG:-$AO_HOME/backlog}"
AO_REPORTS="${AO_REPORTS:-$AO_HOME/reports}"
AO_REPOS="${AO_REPOS:-$AO_HOME/repos}"
AO_RUNS="${AO_RUNS:-$AO_HOME/runs}"
AO_LOCKS="$AO_RUNS/locks"
AO_CONFIG="${AO_CONFIG:-$AO_HOME/config.json}"
AO_INDEX="$AO_RUNS/index.json"
AO_SKILL_DIR="${AO_SKILL_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
AO_RUN_AGENT="${AO_RUN_AGENT:-$AO_SKILL_DIR/bin/run-agent.sh}"
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
  mkdir -p \
    "$AO_RUNS" "$AO_LOCKS" \
    "$AO_REPOS" \
    "$AO_BACKLOG" \
    "$AO_BACKLOG/done" \
    "$AO_BACKLOG/recurring" \
    "$AO_BACKLOG/recurring/stopped" \
    "$AO_REPORTS"
  [[ -f "$AO_INDEX" ]] || echo '[]' > "$AO_INDEX"
}

# ---- frontmatter helpers ----------------------------------------------------
# Extract a YAML scalar from a Markdown file's frontmatter. Crude but works
# for the simple key: value lines we generate.
fm_get() {
  local key="$1" file="$2"
  awk -v k="$key" '
    BEGIN { in_fm=0 }
    /^---[[:space:]]*$/ {
      in_fm = !in_fm; if (!in_fm) exit; next
    }
    in_fm && $0 ~ "^[[:space:]]*"k"[[:space:]]*:" {
      sub("^[[:space:]]*"k"[[:space:]]*:[[:space:]]*","")
      gsub(/^"|"$/,"")
      print; exit
    }
  ' "$file"
}

# Extract first list item under `target_repositories:` (the canonical repo).
fm_first_repo() {
  local file="$1"
  awk '
    /^---[[:space:]]*$/ { fm = !fm; if (!fm) exit; next }
    fm && /^target_repositories:/ { in_list=1; next }
    in_list && /^[^[:space:]-]/   { in_list=0 }
    in_list && /^[[:space:]]*-/ {
      sub(/^[[:space:]]*-[[:space:]]*/,"")
      gsub(/^"|"$/,"")
      print; exit
    }
  ' "$file"
}

# ---- slugs and repos --------------------------------------------------------
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

# Add a worktree at TARGET on a fresh branch. Echoes "branch\nworktree".
create_worktree() {
  local base="$1" agent="$2" slug="$3" run_id="$4" target="$5"
  local prefix
  prefix="$(cfg branch_prefix agent)"
  local branch="${prefix}/${agent}/${slug}-${run_id}"
  local default
  default="$(default_branch "$base")"
  log "creating worktree $target on branch $branch from origin/$default"
  git -C "$base" worktree add -b "$branch" "$target" "origin/$default" >&2
  printf '%s\n%s\n' "$branch" "$target"
}

# ---- agent-task.md assembly -------------------------------------------------
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

# ---- index.json -------------------------------------------------------------
index_upsert() {
  # index_upsert RUN_JSON
  local entry="$1"
  local tmp; tmp="$(mktemp)"
  jq --argjson e "$entry" '
    map(select(.run_id != $e.run_id)) + [$e] | sort_by(.run_id) | reverse
  ' "$AO_INDEX" > "$tmp" && mv "$tmp" "$AO_INDEX"
}

index_get() {
  # index_get RUN_ID
  jq --arg id "$1" 'map(select(.run_id == $id))[0]' "$AO_INDEX"
}

index_latest() {
  jq '.[0]' "$AO_INDEX"
}

# ---- cron management --------------------------------------------------------
# Block markers used in the user crontab.
cron_begin() { printf '# AGENT-ORCHESTRATOR TASK BEGIN id=%s slug=%s status=%s\n' "$1" "$2" "${3:-active}"; }
cron_end()   { printf '# AGENT-ORCHESTRATOR TASK END id=%s\n' "$1"; }

# Read current crontab to stdout (empty if none).
cron_dump() { crontab -l 2>/dev/null || true; }

# Load a new crontab from stdin.
cron_load() { crontab -; }

# Remove a managed block by id. Echoes the new crontab.
cron_strip_block() {
  local id="$1"
  awk -v id="$id" '
    BEGIN { skip=0 }
    $0 ~ ("# AGENT-ORCHESTRATOR TASK BEGIN id="id) { skip=1; next }
    skip && $0 ~ ("# AGENT-ORCHESTRATOR TASK END id="id) { skip=0; next }
    !skip { print }
  '
}

# Find a managed block by id or slug. Prints the block (begin..end inclusive).
cron_find_block() {
  local key="$1"  # id=… or slug=…
  awk -v k="$key" '
    BEGIN { in_block=0 }
    /^# AGENT-ORCHESTRATOR TASK BEGIN/ {
      in_block = (index($0, k) > 0); buf = $0 ORS; next
    }
    in_block { buf = buf $0 ORS }
    /^# AGENT-ORCHESTRATOR TASK END/ && in_block { printf "%s", buf; in_block=0 }
  '
}

# Ensure CRON_TZ line is present at the top of the crontab.
ensure_cron_tz() {
  local tz="$1"
  local existing
  existing="$(cron_dump)"
  if [[ "$existing" == *"CRON_TZ=$tz"* ]]; then
    return 0
  fi
  {
    printf 'CRON_TZ=%s\n' "$tz"
    printf '%s\n' "$existing"
  } | cron_load
}
