#!/usr/bin/env bash
set -euo pipefail

# $HOME is a bind mount from the host and can start out empty: seed the
# dotfiles and directories the image would otherwise have provided.
mkdir -p "$HOME/.local/bin"

for f in .bashrc .profile; do
  if [ ! -e "$HOME/$f" ] && [ -f "/etc/skel/$f" ]; then
    cp "/etc/skel/$f" "$HOME/$f"
  fi
done

# The priming script ships in the image; link it into the (bind-mounted) home on every
# start so it always points at the current image's version.
ln -sfn /usr/local/bin/prime-box "$HOME/prime.sh"

# Shared instructions and skills come from the read-only context/ mount. Link them into
# each agent's (bind-mounted) home on every start, so edits in the repo apply to new
# sessions and a new skill folder shows up after a restart.
ctx=/opt/box-context

link_skills() {
  local dir=$1 s n
  mkdir -p "$dir"
  # Drop links to skills that have since been removed from context/skills.
  find "$dir" -maxdepth 1 -type l -lname "$ctx/skills/*" ! -exec test -e {} \; -delete
  for s in "$ctx"/skills/*/; do
    [ -f "$s/SKILL.md" ] || continue
    n="$(basename "$s")"
    # A real directory of the same name was made inside the box; leave it be.
    if [ -e "$dir/$n" ] && [ ! -L "$dir/$n" ]; then
      echo "entrypoint: skill $n: keeping the local copy in $dir" >&2
      continue
    fi
    ln -sfn "${s%/}" "$dir/$n"
  done
}

if [ -d "$ctx" ]; then
  if [ -n "${CODEX_HOME:-}" ]; then
    mkdir -p "$CODEX_HOME"
    ln -sfn "$ctx/AGENTS.md" "$CODEX_HOME/AGENTS.md"
    link_skills "$CODEX_HOME/skills"
  fi
  # Claude's instructions are linked at build time (/etc/claude-code/CLAUDE.md).
  if [ -n "${CLAUDE_CONFIG_DIR:-}" ]; then
    link_skills "$CLAUDE_CONFIG_DIR/skills"
  fi
fi

if command -v claude >/dev/null 2>&1; then
  # `claude rc` blocks on an interactive "Enable Remote Control? (y/n)" prompt unless this
  # flag is already set in the global config, which the empty bind mount does not carry.
  cfg_dir="${CLAUDE_CONFIG_DIR:-$HOME}"
  cfg="$cfg_dir/.claude.json"
  [ -f "$cfg_dir/.config.json" ] && cfg="$cfg_dir/.config.json"

  mkdir -p "$cfg_dir"
  [ -f "$cfg" ] || echo '{}' > "$cfg"

  tmp="$(mktemp)"
  if jq '.remoteDialogSeen = true' "$cfg" > "$tmp"; then
    mv "$tmp" "$cfg"
  else
    # Leave a malformed config untouched rather than truncating it.
    rm -f "$tmp"
  fi
fi

exec "$@"
