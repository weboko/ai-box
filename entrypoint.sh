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

exec "$@"
