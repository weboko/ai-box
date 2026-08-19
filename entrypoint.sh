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

exec "$@"
